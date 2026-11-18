import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { createPool, assertApi } from "@firstscene/server-data";
import type { Pool } from "@firstscene/server-data";
import { verifyActiveTestDatabase } from "../../tools/database/isolated.mjs";
let owner: Pool;
const headers = () => ({
  origin: process.env.FIRSTSCENE_TEST_ORIGIN!,
  "content-type": "application/json",
});
test.beforeAll(async () => {
  owner = createPool(process.env.DIRECT_DATABASE_URL!, 1);
  await verifyActiveTestDatabase(owner);
});
test.afterAll(async () => {
  await owner?.end();
});
test.beforeEach(async () => {
  await verifyActiveTestDatabase(owner);
  await owner.query("DELETE FROM firstscene.rate_buckets");
});
test("P04 no-cookie private GET401 and actual process/database health200", async ({
  request,
}) => {
  const me = await request.get("/api/v1/me");
  expect(me.status()).toBe(401);
  assertApi(await me.json(), "Error");
  expect(me.headers()["cache-control"]).toContain("no-store");
  for (const path of ["/health/live", "/health/ready"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    assertApi(await response.json(), "Health");
  }
});
test("P04 issue/reuse opaque HttpOnlycookie with safeDTO and actualhash-onlySQLstorage", async ({
  request,
}) => {
  const response = await request.post("/api/v1/session", {
    headers: headers(),
    data: {},
  });
  expect(response.status()).toBe(200);
  const dto = await response.json();
  assertApi(dto, "Session");
  expect(Object.keys(dto).sort()).toEqual(["epoch", "expiresAt"]);
  const cookie = response.headers()["set-cookie"] ?? "";
  expect(cookie.startsWith("firstscene_dev=")).toBe(true);
  expect(cookie.includes("HttpOnly")).toBe(true);
  expect(cookie.includes("SameSite=Lax")).toBe(true);
  expect(cookie.includes("Path=/")).toBe(true);
  const token = cookie.split(";")[0]!.split("=")[1]!;
  expect(Buffer.from(token, "base64url").length).toBe(32);
  const stored = (
    await owner.query(
      "SELECT token_hash FROM firstscene.sessions WHERE epoch=$1",
      [dto.epoch],
    )
  ).rows[0].token_hash as Buffer;
  expect(stored.equals(createHash("sha256").update(token).digest())).toBe(true);
  const again = await request.post("/api/v1/session", {
    headers: headers(),
    data: {},
  });
  expect(await again.json()).toEqual(dto);
  expect(again.headers()["set-cookie"]).toBeUndefined();
  const me = await request.get("/api/v1/me");
  expect(me.status()).toBe(200);
  const data = await me.json();
  assertApi(data, "Me");
  expect(data.session).toEqual(dto);
  expect(JSON.stringify(data).includes(token)).toBe(false);
  expect(data.preferences.revision).toBe(0);
  expect(data.serverPersistence).toBe(true);
});
test("P04 exactOrigin/JSON/FetchMetadata/unknownfield failures write no sessions", async ({
  request,
}) => {
  const before = Number(
    (await owner.query("SELECT count(*) FROM firstscene.sessions")).rows[0]
      .count,
  );
  for (const extra of [
    { origin: "https://other.example" },
    { origin: "null" },
    { "content-type": "text/plain" },
    { "sec-fetch-site": "cross-site" },
  ]) {
    const response = await request.post("/api/v1/session", {
      headers: { ...headers(), ...extra },
      data: "{}",
    });
    expect(response.status()).toBe(403);
    assertApi(await response.json(), "Error");
    expect(response.headers()["set-cookie"]).toBeUndefined();
  }
  const missing = await request.post("/api/v1/session", {
    headers: { "content-type": "application/json" },
    data: {},
  });
  expect(missing.status()).toBe(403);
  for (const data of [
    { sessionId: "chosen-by-client" },
    { token: "chosen-by-client" },
    [],
  ])
    expect(
      (
        await request.post("/api/v1/session", { headers: headers(), data })
      ).status(),
    ).toBe(400);
  expect(
    Number(
      (await owner.query("SELECT count(*) FROM firstscene.sessions")).rows[0]
        .count,
    ),
  ).toBe(before);
});
test("P04 actualHTTP16KiB inclusive boundary, oversize413 and malformedJSON400", async ({
  request,
}) => {
  const good = await request.post("/api/v1/session", {
    headers: headers(),
    data: " ".repeat(16382) + "{}",
  });
  expect(good.status()).toBe(200);
  const large = await request.post("/api/v1/session", {
    headers: headers(),
    data: " ".repeat(16383) + "{}",
  });
  expect(large.status()).toBe(413);
  assertApi(await large.json(), "Error");
  expect(
    (
      await request.post("/api/v1/session", {
        headers: headers(),
        data: "{broken",
      })
    ).status(),
  ).toBe(400);
});
test("P04 realCookieA/B ownedread ignores requested foreignsession IDs", async ({
  playwright,
  baseURL,
}) => {
  const a = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: headers(),
    }),
    b = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: headers(),
    });
  try {
    const sa = await (await a.post("/api/v1/session", { data: {} })).json(),
      sb = await (await b.post("/api/v1/session", { data: {} })).json();
    expect(sa.epoch === sb.epoch).toBe(false);
    const id = (
      await owner.query("SELECT id FROM firstscene.sessions WHERE epoch=$1", [
        sa.epoch,
      ])
    ).rows[0].id;
    await owner.query(
      "INSERT INTO firstscene.bookmarks(session_id,story_id,target_id,content_version) VALUES($1,'post-office','__story__',1)",
      [id],
    );
    const mine = await (await a.get("/api/v1/me")).json(),
      other = await (await b.get("/api/v1/me?sessionId=" + id)).json();
    assertApi(mine, "Me");
    assertApi(other, "Me");
    expect(mine.bookmarks).toHaveLength(1);
    expect(other.bookmarks).toHaveLength(0);
    expect(other.session.epoch).toBe(sb.epoch);
  } finally {
    await a.dispose();
    await b.dispose();
  }
});
test("P04 expiredcookie cannot authenticate and receives a newepoch only byPOST", async ({
  request,
}) => {
  const first = await (
    await request.post("/api/v1/session", { headers: headers(), data: {} })
  ).json();
  await owner.query(
    "UPDATE firstscene.sessions SET created_at=now()-interval '31 days',expires_at=now()-interval '1 day' WHERE epoch=$1",
    [first.epoch],
  );
  expect((await request.get("/api/v1/me")).status()).toBe(401);
  const next = await request.post("/api/v1/session", {
    headers: headers(),
    data: {},
  });
  expect(next.status()).toBe(200);
  expect((await next.json()).epoch === first.epoch).toBe(false);
});
test("P04 concurrent61newcookie-lessHTTPcalls obey30perfixednetworkwindow despite spoofedXFF", async ({
  baseURL,
}) => {
  const results = await Promise.all(
    Array.from({ length: 61 }, async (_, index) => {
      const response = await fetch(baseURL + "/api/v1/session", {
        method: "POST",
        headers: {
          ...headers(),
          "x-forwarded-for": "198.51.100." + (index + 1),
        },
        body: "{}",
      });
      const body = await response.json();
      return {
        status: response.status,
        retryAfter: response.headers.get("retry-after"),
        body,
      };
    }),
  );
  expect(results.every((r) => r.status === 200 || r.status === 429)).toBe(true);
  expect(
    results.some((r) => r.status === 429 && Number(r.retryAfter) > 0),
  ).toBe(true);
  const epochs = results
    .filter((r) => r.status === 200)
    .map((r) => r.body.epoch);
  const windows = (
    await owner.query(
      "SELECT floor(extract(epoch FROM created_at)/900) AS window,count(*) FROM firstscene.sessions WHERE epoch=ANY($1::uuid[]) GROUP BY 1",
      [epochs],
    )
  ).rows;
  expect(windows.every((r) => Number(r.count) <= 30)).toBe(true);
});
test("P04 per-requestnonce dynamicSSR stays readable and productionpolicy excludes unsafe-eval", async ({
  request,
}) => {
  const a = await request.get("/read/post-office"),
    b = await request.get("/read/post-office");
  expect(a.status()).toBe(200);
  const csp = a.headers()["content-security-policy"] ?? "";
  const otherPolicy = b.headers()["content-security-policy"] ?? "";
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  const other = otherPolicy.match(/'nonce-([^']+)'/)?.[1];
  expect(Boolean(nonce)).toBe(true);
  expect(nonce === other).toBe(false);
  expect(csp.includes("'unsafe-eval'")).toBe(false);
  expect(csp.includes("frame-ancestors 'none'")).toBe(true);
  expect(a.headers()["cache-control"]).toContain("no-store");
  const html = await a.text();
  expect(html.includes(`nonce="${nonce}"`)).toBe(true);
  expect(html.includes("기다리는 시간이 생겼지만")).toBe(true);
  expect(a.headers()["x-content-type-options"]).toBe("nosniff");
});
test("P04 unsafe GET/session is405 and creates no record/cookie", async ({
  request,
}) => {
  const before = Number(
    (await owner.query("SELECT count(*) FROM firstscene.sessions")).rows[0]
      .count,
  );
  const response = await request.get("/api/v1/session");
  expect(response.status()).toBe(405);
  expect(response.headers()["set-cookie"]).toBeUndefined();
  expect(
    Number(
      (await owner.query("SELECT count(*) FROM firstscene.sessions")).rows[0]
        .count,
    ),
  ).toBe(before);
});
