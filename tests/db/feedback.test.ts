import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  issueSession,
  authenticateSession,
  createStateRepository,
  feedbackPolicy,
  feedbackWindowQuery,
} from "@firstscene/server-data";
import type { Story } from "@firstscene/story-schema";
import { isolatedDatabase } from "./fixture";
let db: Awaited<ReturnType<typeof isolatedDatabase>>;
const stories = ["post-office", "tide-station"].map(
  (id) =>
    JSON.parse(
      readFileSync(`content/generated/stories/${id}.json`, "utf8"),
    ) as Story,
);
beforeAll(async () => {
  db = await isolatedDatabase();
});
afterAll(async () => {
  await db?.cleanup();
});
async function setup() {
  const s = await issueSession(
    db.runtime,
    process.env.RATE_LIMIT_HMAC_SECRET!,
    null,
    "loopback",
  );
  return {
    ctx: (await authenticateSession(db.runtime, s.token))!,
    repo: createStateRepository(
      db.runtime,
      stories,
      process.env.RATE_LIMIT_HMAC_SECRET!,
    ),
  };
}
const input = () => ({
  storyId: "post-office",
  operationId: randomUUID(),
  code: "helpful" as const,
});
it("KST midnight bounds include00:00 and exclude the prior millisecond regardless of connection timezone", async () => {
  const client = await db.owner.connect();
  try {
    await client.query("BEGIN");
    for (const zone of ["UTC", "America/Los_Angeles", "Asia/Seoul"]) {
      await client.query("SELECT set_config('TimeZone',$1,true)", [zone]);
      for (const [instant, start, reset] of [
        [
          "2026-11-18T14:59:59.999Z",
          "2026-11-17T15:00:00.000Z",
          "2026-11-18T15:00:00.000Z",
        ],
        [
          "2026-11-18T15:00:00.000Z",
          "2026-11-18T15:00:00.000Z",
          "2026-11-19T15:00:00.000Z",
        ],
        [
          "2026-11-18T00:00:00.000Z",
          "2026-11-17T15:00:00.000Z",
          "2026-11-18T15:00:00.000Z",
        ],
        [
          "2026-12-31T15:00:00.000Z",
          "2026-12-31T15:00:00.000Z",
          "2027-01-01T15:00:00.000Z",
        ],
      ]) {
        // Only this owned test query supplies a timestamp; production has no time override.
        const r = (
          await client.query(
            feedbackWindowQuery.replace("clock_timestamp()", "$2::timestamptz"),
            [feedbackPolicy.timeZone, instant],
          )
        ).rows[0];
        expect(r.starts_at.toISOString()).toBe(start);
        expect(r.resets_at.toISOString()).toBe(reset);
        expect(r.retry_after).toBeGreaterThanOrEqual(1);
        expect(r.retry_after).toBeLessThanOrEqual(86400);
      }
    }
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
it("the5allowance uses current KST bounds, not the most recent24hours, and exact midnight counts", async () => {
  const { ctx, repo } = await setup();
  const w = (
    await db.owner.query(feedbackWindowQuery, [feedbackPolicy.timeZone])
  ).rows[0];
  for (let i = 0; i < 5; i++)
    await db.owner.query(
      "INSERT INTO firstscene.feedback(session_id,story_id,operation_id,code,created_at) VALUES($1,'post-office',$2,'helpful',$3::timestamptz-interval '1 millisecond')",
      [ctx.id, randomUUID(), w.starts_at],
    );
  for (let i = 0; i < 5; i++)
    expect((await repo.submitFeedback(ctx, input())).status).toBe(201);
  await expect(repo.submitFeedback(ctx, input())).rejects.toMatchObject({
    status: 429,
    code: "FEEDBACK_LIMIT",
    retryAfter: expect.any(Number),
  });
  expect(
    Number(
      (
        await db.owner.query(
          "SELECT count(*) FROM firstscene.feedback WHERE session_id=$1",
          [ctx.id],
        )
      ).rows[0].count,
    ),
  ).toBe(10);
  const another = await setup();
  for (let i = 0; i < 5; i++)
    await db.owner.query(
      "INSERT INTO firstscene.feedback(session_id,story_id,operation_id,code,created_at) VALUES($1,'post-office',$2,'comfortable',$3)",
      [another.ctx.id, randomUUID(), w.starts_at],
    );
  await expect(
    another.repo.submitFeedback(another.ctx, input()),
  ).rejects.toMatchObject({ code: "FEEDBACK_LIMIT" });
});
it("12concurrent distinct feedback writes accept exactly5, independently per story and session", async () => {
  const a = await setup(),
    b = await setup();
  const outcomes = await Promise.allSettled(
    Array.from({ length: 12 }, () => a.repo.submitFeedback(a.ctx, input())),
  );
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(5);
  for (const r of outcomes.filter((r) => r.status === "rejected"))
    expect(r.reason).toMatchObject({ status: 429, code: "FEEDBACK_LIMIT" });
  expect(
    (
      await a.repo.submitFeedback(a.ctx, {
        ...input(),
        storyId: "tide-station",
      })
    ).status,
  ).toBe(201);
  expect((await b.repo.submitFeedback(b.ctx, input())).status).toBe(201);
});
it("exact replay consumes one allowance even after generic receipt expiry; changed code/story conflicts", async () => {
  const { ctx, repo } = await setup();
  const p = input();
  const results = await Promise.all(
    Array.from({ length: 8 }, () => repo.submitFeedback(ctx, p)),
  );
  expect(results.every((r) => r.status === 201)).toBe(true);
  await expect(
    repo.submitFeedback(ctx, { ...p, code: "distracting" }),
  ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
  await db.owner.query(
    "UPDATE firstscene.mutation_receipts SET created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour' WHERE session_id=$1 AND operation_id=$2",
    [ctx.id, p.operationId],
  );
  expect((await repo.submitFeedback(ctx, p)).body).toEqual({ accepted: true });
  await db.owner.query(
    "DELETE FROM firstscene.mutation_receipts WHERE session_id=$1 AND operation_id=$2",
    [ctx.id, p.operationId],
  );
  await expect(
    repo.submitFeedback(ctx, { ...p, storyId: "tide-station" }),
  ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
  expect(
    Number(
      (
        await db.owner.query(
          "SELECT count(*) FROM firstscene.feedback WHERE session_id=$1",
          [ctx.id],
        )
      ).rows[0].count,
    ),
  ).toBe(1);
});
it("feedback and receipt roll back atomically if receipt insertion fails", async () => {
  const { ctx, repo } = await setup(),
    p = input();
  await db.owner.query(
    `CREATE FUNCTION firstscene.feedback_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation_id='${p.operationId}'::uuid THEN RAISE EXCEPTION 'owned feedback receipt rejection'; END IF; RETURN NEW; END $$`,
  );
  await db.owner.query(
    "CREATE TRIGGER feedback_receipt_failure BEFORE INSERT ON firstscene.mutation_receipts FOR EACH ROW EXECUTE FUNCTION firstscene.feedback_receipt_failure()",
  );
  try {
    await expect(repo.submitFeedback(ctx, p)).rejects.toMatchObject({
      code: "P0001",
    });
    expect(
      (
        await db.owner.query(
          "SELECT 1 FROM firstscene.feedback WHERE session_id=$1",
          [ctx.id],
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    await db.owner.query(
      "DROP TRIGGER feedback_receipt_failure ON firstscene.mutation_receipts",
    );
    await db.owner.query("DROP FUNCTION firstscene.feedback_receipt_failure()");
  }
  expect((await repo.submitFeedback(ctx, p)).status).toBe(201);
});
it("quota timestamps are taken after a contended session lock is acquired", async () => {
  const { ctx, repo } = await setup(),
    lock = await db.owner.connect();
  let waiting: ReturnType<typeof repo.submitFeedback> | undefined;
  const p = input();
  let released: Date;
  try {
    await lock.query("BEGIN");
    await lock.query(
      "SELECT id FROM firstscene.sessions WHERE id=$1 FOR UPDATE",
      [ctx.id],
    );
    const blockingPid = (await lock.query("SELECT pg_backend_pid() AS pid"))
      .rows[0].pid;
    waiting = repo.submitFeedback(ctx, p);
    await expect
      .poll(async () =>
        Number(
          (
            await lock.query(
              "SELECT count(*) FROM pg_locks WHERE NOT granted AND $1=ANY(pg_blocking_pids(pid))",
              [blockingPid],
            )
          ).rows[0].count,
        ),
      )
      .toBeGreaterThan(0);
    released = (await lock.query("SELECT clock_timestamp() AS instant")).rows[0]
      .instant;
  } finally {
    await lock.query("ROLLBACK");
    lock.release();
  }
  expect((await waiting!).status).toBe(201);
  const row = (
    await db.owner.query(
      "SELECT created_at >= $2 AS after_lock FROM firstscene.feedback WHERE operation_id=$1",
      [p.operationId, released!],
    )
  ).rows[0];
  expect(row.after_lock).toBe(true);
});
