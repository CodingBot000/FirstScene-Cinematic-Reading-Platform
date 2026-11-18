import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createPool } from "@firstscene/server-data";
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
  await owner.query("DELETE FROM firstscene.rate_buckets");
});
test("P04 QA-D07 delete owns cascades/expiry and repeat204 while another browser remains intact", async ({
  request,
  playwright,
}) => {
  const other = await playwright.request.newContext({
    baseURL: process.env.FIRSTSCENE_TEST_ORIGIN,
  });
  try {
    await request.post("/api/v1/session", { headers: headers(), data: {} });
    const a = await (await request.get("/api/v1/me")).json();
    await other.post("/api/v1/session", { headers: headers(), data: {} });
    const b = await (await other.get("/api/v1/me")).json();
    await request.put("/api/v1/bookmarks/post-office/__story__", {
      headers: headers(),
      data: { operationId: randomUUID(), contentVersion: 1 },
    });
    expect(
      (await (await request.get("/api/v1/me")).json()).bookmarks,
    ).toHaveLength(1);
    const removed = await request.delete("/api/v1/me", {
      headers: headers(),
      data: {},
    });
    expect(removed.status()).toBe(204);
    expect(removed.headers()["set-cookie"]).toMatch(
      /firstscene_dev=;.*HttpOnly.*Max-Age=0/,
    );
    expect(removed.headers()["cache-control"]).toBe("private, no-store");
    expect((await request.get("/api/v1/me")).status()).toBe(401);
    expect(
      (
        await request.delete("/api/v1/me", { headers: headers(), data: {} })
      ).status(),
    ).toBe(204);
    expect((await (await other.get("/api/v1/me")).json()).session.epoch).toBe(
      b.session.epoch,
    );
    expect(
      (
        await owner.query("SELECT id FROM firstscene.sessions WHERE epoch=$1", [
          a.session.epoch,
        ])
      ).rowCount,
    ).toBe(0);
    await request.post("/api/v1/session", { headers: headers(), data: {} });
    const fresh = await (await request.get("/api/v1/me")).json();
    expect(fresh.session.epoch).not.toBe(a.session.epoch);
    expect(fresh.bookmarks).toEqual([]);
  } finally {
    await other.dispose();
  }
});
test("P04 deletion validates same-origin JSON even without a cookie", async ({
  request,
}) => {
  expect((await request.delete("/api/v1/me", { data: {} })).status()).toBe(403);
  expect(
    (
      await request.delete("/api/v1/me", {
        headers: { ...headers(), origin: "https://invalid.test" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.delete("/api/v1/me", {
        headers: headers(),
        data: { sessionId: randomUUID() },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.delete("/api/v1/me", { headers: headers(), data: {} })
    ).status(),
  ).toBe(204);
});
test("P04 real owned DB outage makes readiness/deletion503 but public story remains readable; recovery works", async ({
  request,
}) => {
  await request.post("/api/v1/session", { headers: headers(), data: {} });
  const before = await (await request.get("/api/v1/me")).json();
  const name = (await owner.query("SELECT current_database() AS name")).rows[0]
    .name;
  if (!/^firstscene_test_[a-f0-9]+$/.test(name))
    throw new Error("OWNED_TEST_DATABASE_REQUIRED");
  // Only this wrapper-created, ownership-verified disposable database is affected.
  const adminUrl = new URL(process.env.DIRECT_DATABASE_URL!);
  adminUrl.pathname = "/postgres";
  const admin = createPool(adminUrl.toString(), 1);
  try {
    await admin.query(`ALTER DATABASE "${name}" ALLOW_CONNECTIONS false`);
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND usename=$2",
      [name, decodeURIComponent(new URL(process.env.DATABASE_URL!).username)],
    );
    expect((await request.get("/health/live")).status()).toBe(200);
    expect((await request.get("/health/ready")).status()).toBe(503);
    const page = await request.get("/read/post-office");
    expect(page.status()).toBe(200);
    expect(await page.text()).toContain("mail-s06-b06");
    const deletion = await request.delete("/api/v1/me", {
      headers: headers(),
      data: {},
    });
    expect(deletion.status()).toBe(503);
    expect(deletion.headers()["set-cookie"]).toBeUndefined();
  } finally {
    try {
      await admin.query(`ALTER DATABASE "${name}" ALLOW_CONNECTIONS true`);
    } finally {
      await admin.end();
    }
  }
  expect((await request.get("/health/ready")).status()).toBe(200);
  expect((await (await request.get("/api/v1/me")).json()).session.epoch).toBe(
    before.session.epoch,
  );
});
