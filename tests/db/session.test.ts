import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  issueSession,
  authenticateSession,
  readMe,
  consumeRate,
} from "@firstscene/server-data";
import { isolatedDatabase } from "./fixture";
let db: Awaited<ReturnType<typeof isolatedDatabase>>;
beforeAll(async () => {
  db = await isolatedDatabase();
});
afterAll(async () => {
  await db?.cleanup();
});
beforeEach(async () => {
  await db.owner.query("DELETE FROM firstscene.rate_buckets");
});
it("P04 real sessions use32randombytes, storeonlySHA256 and return a safeEpoch DTO", async () => {
  const result = await issueSession(
    db.runtime,
    process.env.RATE_LIMIT_HMAC_SECRET!,
    null,
    "loopback",
  );
  expect(Object.keys(result.session).sort()).toEqual(["epoch", "expiresAt"]);
  expect(result.token).not.toBeNull();
  expect(Buffer.from(result.token!, "base64url").length).toBe(32);
  const ctx = await authenticateSession(db.runtime, result.token);
  expect(ctx?.epoch).toBe(result.session.epoch);
  const hash = (
    await db.owner.query(
      "SELECT token_hash FROM firstscene.sessions WHERE id=$1",
      [ctx!.id],
    )
  ).rows[0].token_hash as Buffer;
  expect(hash.equals(createHash("sha256").update(result.token!).digest())).toBe(
    true,
  );
  const me = await readMe(db.runtime, ctx!);
  expect(JSON.stringify(me).includes(result.token!)).toBe(false);
  expect(me.preferences).toMatchObject({
    mode: "cinematic",
    fontSize: 20,
    revision: 0,
  });
});
it("P04 validcookie reuses sameabsoluteexpiry and another session gets a differentepoch", async () => {
  const a = await issueSession(
      db.runtime,
      process.env.RATE_LIMIT_HMAC_SECRET!,
      null,
      "loopback",
    ),
    reused = await issueSession(
      db.runtime,
      process.env.RATE_LIMIT_HMAC_SECRET!,
      a.token,
      "loopback",
    ),
    b = await issueSession(
      db.runtime,
      process.env.RATE_LIMIT_HMAC_SECRET!,
      null,
      "loopback",
    );
  expect(reused.token).toBeNull();
  expect(reused.session).toEqual(a.session);
  expect(b.session.epoch === a.session.epoch).toBe(false);
});
it("P04 expired or malformed tokens never authenticate or fixate issuance", async () => {
  const a = await issueSession(
    db.runtime,
    process.env.RATE_LIMIT_HMAC_SECRET!,
    null,
    "loopback",
  );
  const ctx = await authenticateSession(db.runtime, a.token);
  await db.owner.query(
    "UPDATE firstscene.sessions SET created_at=now()-interval '31 days',expires_at=now()-interval '1 day' WHERE id=$1",
    [ctx!.id],
  );
  expect(await authenticateSession(db.runtime, a.token)).toBeNull();
  expect(await authenticateSession(db.runtime, "fixed-by-client")).toBeNull();
  const b = await issueSession(
    db.runtime,
    process.env.RATE_LIMIT_HMAC_SECRET!,
    a.token,
    "loopback",
  );
  expect(b.session.epoch === a.session.epoch).toBe(false);
});
it("P04 atomic ratebucket caps concurrentrequests and providesretryafter without rawnetworkidentifiers", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 31 }, () =>
      consumeRate(
        db.runtime,
        process.env.RATE_LIMIT_HMAC_SECRET!,
        "test:atomic",
        30,
        900,
      ),
    ),
  );
  expect(
    results.filter((r) => r.status === "fulfilled").length,
  ).toBeLessThanOrEqual(30);
  expect(
    results.some(
      (r) =>
        r.status === "rejected" &&
        r.reason.status === 429 &&
        r.reason.retryAfter > 0,
    ),
  ).toBe(true);
  const rows = (
    await db.owner.query("SELECT bucket_key,count FROM firstscene.rate_buckets")
  ).rows;
  expect(
    rows.every(
      (r) =>
        Buffer.isBuffer(r.bucket_key) &&
        r.bucket_key.length === 32 &&
        r.count <= 31,
    ),
  ).toBe(true);
});
it("P06 trustednetworkAexhaustion doesnotconsume networkB's30allowance and stores onlyHMAC keys", async () => {
  const secret = process.env.RATE_LIMIT_HMAC_SECRET!;
  for (let i = 0; i < 30; i++)
    await issueSession(db.runtime, secret, null, "vercel:192.0.2.1");
  await expect(
    issueSession(db.runtime, secret, null, "vercel:192.0.2.1"),
  ).rejects.toMatchObject({ status: 429 });
  const b = await issueSession(db.runtime, secret, null, "vercel:198.51.100.2");
  expect(b.token).not.toBeNull();
  const buckets = (
    await db.owner.query("SELECT bucket_key,count FROM firstscene.rate_buckets")
  ).rows;
  expect(buckets).toHaveLength(2);
  expect(buckets.map((r) => r.count).sort((a, b) => a - b)).toEqual([1, 31]);
  expect(
    buckets.every(
      (r) => Buffer.isBuffer(r.bucket_key) && r.bucket_key.length === 32,
    ),
  ).toBe(true);
});
it("P06 unverifiednetwork cannot create a new session orbucket; validcookie reuse requires no newnetwork allowance", async () => {
  const secret = process.env.RATE_LIMIT_HMAC_SECRET!;
  const before = Number(
    (await db.owner.query("SELECT count(*) FROM firstscene.sessions")).rows[0]
      .count,
  );
  await expect(
    issueSession(db.runtime, secret, null, null),
  ).rejects.toMatchObject({ status: 503, code: "NETWORK_IDENTITY_REQUIRED" });
  expect(
    Number(
      (await db.owner.query("SELECT count(*) FROM firstscene.sessions")).rows[0]
        .count,
    ),
  ).toBe(before);
  expect(
    (await db.owner.query("SELECT 1 FROM firstscene.rate_buckets")).rowCount,
  ).toBe(0);
  const s = await issueSession(db.runtime, secret, null, "loopback");
  expect(
    (await issueSession(db.runtime, secret, s.token, null)).session,
  ).toEqual(s.session);
});
