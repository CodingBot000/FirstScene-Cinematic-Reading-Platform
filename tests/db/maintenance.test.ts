import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID, createHmac } from "node:crypto";
import {
  cleanupExpired,
  deleteSession,
  issueSession,
  authenticateSession,
  createStateRepository,
} from "@firstscene/server-data";
import type { Story } from "@firstscene/story-schema";
import { readFileSync } from "node:fs";
import { isolatedDatabase } from "./fixture";
let db: Awaited<ReturnType<typeof isolatedDatabase>>;
const secret = () => process.env.RATE_LIMIT_HMAC_SECRET!;
beforeAll(async () => {
  db = await isolatedDatabase();
});
afterAll(async () => {
  await db?.cleanup();
});
it("P04 delete cascades all owned rows and write bucket; repeated and expired-token deletion is safe", async () => {
  const a = await issueSession(db.runtime, secret(), null, "loopback");
  const b = await issueSession(db.runtime, secret(), null, "loopback");
  const ctx = (await authenticateSession(db.runtime, a.token))!;
  const story = JSON.parse(
    readFileSync("content/generated/stories/post-office.json", "utf8"),
  ) as Story;
  const repo = createStateRepository(db.runtime, [story], secret());
  await repo.putProgress(ctx, story.id, {
    operationId: randomUUID(),
    contentVersion: story.version,
    contentHash: story.contentHash,
    sceneId: story.scenes[0]!.id,
    beatId: story.scenes[0]!.beats[0]!.id,
    fraction: 0,
    completed: false,
    expectedRevision: 0,
  });
  await repo.putBookmark(ctx, story.id, "__story__", {
    operationId: randomUUID(),
    contentVersion: story.version,
  });
  await db.owner.query(
    "INSERT INTO firstscene.feedback(session_id,story_id,operation_id,code) VALUES($1,$2,$3,'helpful')",
    [ctx.id, story.id, randomUUID()],
  );
  await db.owner.query(
    "UPDATE firstscene.sessions SET created_at=now()-interval '31 days',expires_at=now()-interval '1 day' WHERE id=$1",
    [ctx.id],
  );
  await deleteSession(db.runtime, a.token, secret());
  await deleteSession(db.runtime, a.token, secret());
  for (const table of [
    "preferences",
    "reading_progress",
    "bookmarks",
    "mutation_receipts",
    "feedback",
  ])
    expect(
      (
        await db.owner.query(
          `SELECT 1 FROM firstscene.${table} WHERE session_id=$1`,
          [ctx.id],
        )
      ).rowCount,
    ).toBe(0);
  expect(
    (
      await db.owner.query(
        "SELECT 1 FROM firstscene.rate_buckets WHERE bucket_key=$1",
        [
          createHmac("sha256", secret())
            .update("write:" + ctx.epoch)
            .digest(),
        ],
      )
    ).rowCount,
  ).toBe(0);
  expect(await authenticateSession(db.runtime, b.token)).not.toBeNull();
  await expect(
    repo.putPreferences(ctx, {
      operationId: randomUUID(),
      expectedRevision: 0,
      mode: "plain",
      effects: "full",
      fontSize: 20,
      theme: "dark",
    }),
  ).rejects.toMatchObject({ status: 401 });
});
it("P04 cleanup bounds each table, skips locked rows and preserves live sessions/receipts/buckets", async () => {
  const live = await issueSession(db.runtime, secret(), null, "loopback");
  const ctx = (await authenticateSession(db.runtime, live.token))!;
  for (let i = 0; i < 3; i++) {
    await db.owner.query(
      "INSERT INTO firstscene.sessions(id,epoch,token_hash,created_at,expires_at) VALUES($1,$2,decode($3,'hex'),now()-interval '31 days',now()-interval '1 day')",
      [randomUUID(), randomUUID(), randomUUID().replaceAll("-", "").repeat(2)],
    );
    await db.owner.query(
      "INSERT INTO firstscene.mutation_receipts(session_id,operation_id,request_hash,route,response_status,response_body,created_at,expires_at) VALUES($1,$2,$3,'test',204,'null',now()-interval '25 hours',now()-interval '1 hour')",
      [ctx.id, randomUUID(), "a".repeat(64)],
    );
    await db.owner.query(
      "INSERT INTO firstscene.rate_buckets(bucket_key,window_start,count,expires_at) VALUES(decode($1,'hex'),now()-interval '1 hour',1,now()-interval '45 minutes')",
      [randomUUID().replaceAll("-", "").repeat(2)],
    );
  }
  const receipt = randomUUID();
  await db.owner.query(
    "INSERT INTO firstscene.mutation_receipts(session_id,operation_id,request_hash,route,response_status,response_body,expires_at) VALUES($1,$2,$3,'test',204,'null',now()+interval '24 hours')",
    [ctx.id, receipt, "b".repeat(64)],
  );
  const lock = await db.owner.connect();
  try {
    await lock.query("BEGIN");
    await lock.query(
      "SELECT id FROM firstscene.sessions WHERE expires_at<now() ORDER BY expires_at LIMIT 1 FOR UPDATE",
    );
    expect(await cleanupExpired(db.runtime, 2)).toEqual({
      receipts: 2,
      rateBuckets: 2,
      sessions: 2,
    });
  } finally {
    await lock.query("ROLLBACK");
    lock.release();
  }
  expect(await cleanupExpired(db.runtime, 2)).toEqual({
    receipts: 1,
    rateBuckets: 1,
    sessions: 1,
  });
  expect(await cleanupExpired(db.runtime, 2)).toEqual({
    receipts: 0,
    rateBuckets: 0,
    sessions: 0,
  });
  expect(await authenticateSession(db.runtime, live.token)).not.toBeNull();
  expect(
    (
      await db.owner.query(
        "SELECT 1 FROM firstscene.mutation_receipts WHERE operation_id=$1",
        [receipt],
      )
    ).rowCount,
  ).toBe(1);
  expect(
    Number(
      (
        await db.owner.query(
          "SELECT count(*) FROM firstscene.rate_buckets WHERE expires_at>now()",
        )
      ).rows[0].count,
    ),
  ).toBeGreaterThan(0);
});
