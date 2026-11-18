import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  issueSession,
  authenticateSession,
  createStateRepository,
} from "@firstscene/server-data";
import type { Story } from "@firstscene/story-schema";
import { isolatedDatabase } from "./fixture";
let db: Awaited<ReturnType<typeof isolatedDatabase>>;
const story = JSON.parse(
  readFileSync("content/generated/stories/post-office.json", "utf8"),
) as Story;
beforeAll(async () => {
  db = await isolatedDatabase();
});
afterAll(async () => {
  await db?.cleanup();
});
async function setup() {
  const issued = await issueSession(
    db.runtime,
    process.env.RATE_LIMIT_HMAC_SECRET!,
    null,
    "loopback",
  );
  const ctx = await authenticateSession(db.runtime, issued.token);
  return {
    ctx: ctx!,
    repo: createStateRepository(
      db.runtime,
      [story],
      process.env.RATE_LIMIT_HMAC_SECRET!,
    ),
  };
}
const input = () => ({
  operationId: randomUUID(),
  contentVersion: story.version,
  contentHash: story.contentHash,
  sceneId: story.scenes[0]!.id,
  beatId: story.scenes[0]!.beats[0]!.id,
  fraction: 0.3,
  completed: false,
  expectedRevision: 0,
});
it("P04 mutationandreceipt rollbacktogether whenactualreceiptSQLfails afterprogresswrite", async () => {
  const { ctx, repo } = await setup();
  const value = input();
  await db.owner.query(
    `CREATE FUNCTION firstscene.test_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation_id='${value.operationId}'::uuid THEN RAISE EXCEPTION 'owned test receipt rejection'; END IF; RETURN NEW; END $$`,
  );
  await db.owner.query(
    "CREATE TRIGGER test_receipt_failure BEFORE INSERT ON firstscene.mutation_receipts FOR EACH ROW EXECUTE FUNCTION firstscene.test_receipt_failure()",
  );
  try {
    await expect(repo.putProgress(ctx, story.id, value)).rejects.toMatchObject({
      code: "P0001",
    });
    expect(
      (
        await db.owner.query(
          "SELECT 1 FROM firstscene.reading_progress WHERE session_id=$1",
          [ctx.id],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await db.owner.query(
          "SELECT 1 FROM firstscene.mutation_receipts WHERE session_id=$1",
          [ctx.id],
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    await db.owner.query(
      "DROP TRIGGER test_receipt_failure ON firstscene.mutation_receipts",
    );
    await db.owner.query("DROP FUNCTION firstscene.test_receipt_failure()");
  }
  expect((await repo.putProgress(ctx, story.id, value)).body?.revision).toBe(1);
});
it("P04 sessionrowlocks serializeownwrites withoutblocking anotherbrowser session", async () => {
  const a = await setup(),
    b = await setup();
  const lock = await db.owner.connect();
  let waiting: Promise<PromiseSettledResult<unknown>[]> | undefined;
  try {
    await lock.query("BEGIN");
    await lock.query("SET LOCAL idle_in_transaction_session_timeout='15s'");
    await lock.query(
      "SELECT id FROM firstscene.sessions WHERE id=$1 FOR UPDATE",
      [a.ctx.id],
    );
    waiting = Promise.allSettled([
      a.repo.putProgress(a.ctx, story.id, input()),
    ]);
    const other = await b.repo.putProgress(b.ctx, story.id, input());
    expect(other.body?.revision).toBe(1);
  } finally {
    try {
      await lock.query("ROLLBACK");
    } finally {
      lock.release();
    }
  }
  expect((await waiting!)[0]?.status).toBe("fulfilled");
});
it("P04 staleauthenticatedcontext cannotrecreateprogress aftersessiondeletion", async () => {
  const { ctx, repo } = await setup();
  await db.owner.query("DELETE FROM firstscene.sessions WHERE id=$1", [ctx.id]);
  await expect(repo.putProgress(ctx, story.id, input())).rejects.toMatchObject({
    status: 401,
  });
  expect(
    (
      await db.owner.query(
        "SELECT 1 FROM firstscene.reading_progress WHERE session_id=$1",
        [ctx.id],
      )
    ).rowCount,
  ).toBe(0);
});
