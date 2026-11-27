import { it, expect, vi } from "vitest";
import {
  deriveHttpPolicy,
  sessionCookie,
  readJsonWrite,
  apiRequest,
  jsonResponse,
  assertApiResponse,
} from "@firstscene/server-data";
import { createRequest } from "../../apps/web/features/reading-sync/transport";
const local = deriveHttpPolicy("http://127.0.0.1:3100", "local");
const request = (body: string, headers: Record<string, string> = {}) =>
  new Request(local.origin + "/api/v1/session", {
    method: "POST",
    headers: {
      origin: local.origin,
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
it("P04 cookie policy distinguishes scoped local productionbuild from public HTTPS without Domain", () => {
  const session = {
    epoch: "00000000-0000-0000-0000-000000000000",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
  const dev = sessionCookie(local, "x".repeat(43), session);
  expect(dev.startsWith("firstscene_dev=")).toBe(true);
  expect(dev.includes("HttpOnly")).toBe(true);
  const secure = sessionCookie(
    deriveHttpPolicy("https://firstscene.example", "public"),
    "x".repeat(43),
    session,
  );
  expect(secure.startsWith("__Host-firstscene=")).toBe(true);
  expect(secure.includes("; Secure")).toBe(true);
  expect(secure.includes("Domain=")).toBe(false);
  expect(() =>
    deriveHttpPolicy("https://firstscene.example", "local"),
  ).toThrow();
  expect(() =>
    deriveHttpPolicy("http://firstscene.example", "public"),
  ).toThrow();
});
it("P04 exactOrigin/fetchmetadata/JSON checks precede parsing and storage", async () => {
  await expect(readJsonWrite(request("{}"), local, "Empty")).resolves.toEqual(
    {},
  );
  for (const headers of [
    { origin: "null" },
    { origin: "https://other.example" },
    { "sec-fetch-site": "cross-site" },
    { "content-type": "text/plain" },
  ])
    await expect(
      readJsonWrite(request("{}", headers), local, "Empty"),
    ).rejects.toMatchObject({ status: 403 });
  await expect(
    readJsonWrite(
      new Request(local.origin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      local,
      "Empty",
    ),
  ).rejects.toMatchObject({ status: 403 });
});
it("P04 reads at most16KiB UTF8 and rejects unknown fields/malformedJSON", async () => {
  await expect(
    readJsonWrite(request(" ".repeat(16382) + "{}"), local, "Empty"),
  ).resolves.toEqual({});
  await expect(
    readJsonWrite(request(" ".repeat(16383) + "{}"), local, "Empty"),
  ).rejects.toMatchObject({ status: 413 });
  await expect(
    readJsonWrite(request("{broken"), local, "Empty"),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    readJsonWrite(request('{"sessionId":"fixed"}'), local, "Empty"),
  ).rejects.toMatchObject({ status: 400 });
});
it("P04 unexpected server errors return redacted no-store envelope and server-generated requestId", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    const response = await apiRequest("/test", async () => {
      throw new Error("test-only-private-value");
    });
    const body = await response.json();
    const record = JSON.parse(log.mock.calls[0]![0]);
    expect(response.status).toBe(503);
    expect(body.error.code).toBe("STORAGE_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain("test-only-private-value");
    expect(JSON.stringify(record)).not.toContain("test-only-private-value");
    expect(body.error.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(jsonResponse({ status: "ok" }).headers.get("vary")).toBe("Cookie");
    expect(record).toMatchObject({
      requestId: response.headers.get("x-request-id"),
      route: "/test",
      status: 503,
      code: "STORAGE_UNAVAILABLE",
      retryable: true,
      transaction: null,
    });
    expect(record.requestId).toBe(body.error.requestId);
  } finally {
    log.mockRestore();
  }
});
it("OB-01 reading transport accepts a request ID only from the UUID response header", async () => {
  const requestId = "7d1e7adb-852d-4e31-a543-abb3ca931eff";
  for (const [header, expected] of [
    [requestId, requestId],
    ["diagnostic-text", null],
  ] as const) {
    const fetchRequest = vi.fn(async () =>
      Response.json({}, { status: 503, headers: { "x-request-id": header } }),
    );
    await expect(
      createRequest(fetchRequest)("/api/v1/me"),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      requestId: expected,
    });
  }
});
it("P04 response privacy cannot be overridden by a caller header", () => {
  expect(
    jsonResponse({}, 200, { "cache-control": "public" }).headers.get(
      "cache-control",
    ),
  ).toBe("private, no-store");
});

it("P04 server response contract rejects accidental private fields without exposing them", () => {
  expect(() =>
    assertApiResponse(
      {
        epoch: "00000000-0000-0000-0000-000000000000",
        expiresAt: new Date().toISOString(),
        token: "not-real-test-secret",
      },
      "Session",
    ),
  ).toThrow("기록 상태를 안전하게");
});
it("P04 whole-request deadline returns503 rather than hanging past10seconds", async () => {
  vi.useFakeTimers();
  try {
    const pending = apiRequest(
      "/test-deadline",
      () => new Promise<Response>(() => {}),
    );
    await vi.advanceTimersByTimeAsync(10000);
    const response = await pending;
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("REQUEST_TIMEOUT");
  } finally {
    vi.useRealTimers();
  }
});
