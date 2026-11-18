import { it, expect, vi } from "vitest";
import {
  deriveHttpPolicy,
  sessionCookie,
  readJsonWrite,
  apiRequest,
  jsonResponse,
  assertApiResponse,
} from "@firstscene/server-data";
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
  const response = await apiRequest("/test", async () => {
    throw new Error("test-only-private-value");
  });
  const body = await response.json();
  expect(response.status).toBe(503);
  expect(body.error.code).toBe("STORAGE_UNAVAILABLE");
  expect(JSON.stringify(body).includes("test-only-private-value")).toBe(false);
  expect(body.error.requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(jsonResponse({ status: "ok" }).headers.get("vary")).toBe("Cookie");
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
