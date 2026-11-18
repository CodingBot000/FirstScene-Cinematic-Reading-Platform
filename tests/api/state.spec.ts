import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createPool, assertApi } from "@firstscene/server-data";
import type { Pool } from "@firstscene/server-data";
import { verifyActiveTestDatabase } from "../../tools/database/isolated.mjs";
const stories = ["post-office", "tide-station"].map((id) =>
  JSON.parse(readFileSync("content/generated/stories/" + id + ".json", "utf8")),
);
const story = stories[0];
let owner: Pool;
const headers = () => ({
  origin: process.env.FIRSTSCENE_TEST_ORIGIN!,
  "content-type": "application/json",
});
const progress = (
  scene = 0,
  beat = 0,
  expectedRevision = 0,
  completed = false,
) => ({
  contentVersion: story.version,
  contentHash: story.contentHash,
  sceneId: story.scenes[scene].id,
  beatId: story.scenes[scene].beats[beat].id,
  fraction: 0.3,
  completed,
  expectedRevision,
  operationId: randomUUID(),
});
const prefs = (expectedRevision = 0) => ({
  mode: "plain",
  effects: "reduced",
  fontSize: 22,
  theme: "light",
  expectedRevision,
  operationId: randomUUID(),
});
test.beforeAll(async () => {
  owner = createPool(process.env.DIRECT_DATABASE_URL!, 1);
  await verifyActiveTestDatabase(owner);
});
test.afterAll(async () => {
  await owner?.end();
});
test.beforeEach(async ({ request }) => {
  await owner.query("DELETE FROM firstscene.rate_buckets");
  expect(
    (
      await request.post("/api/v1/session", { headers: headers(), data: {} })
    ).status(),
  ).toBe(200);
});
test("P04 QA-D03/D04 preferences CAS and same-id replay/conflict are realSQLtransactions", async ({
  request,
}) => {
  const input = prefs();
  const first = await request.put("/api/v1/preferences", {
    headers: headers(),
    data: input,
  });
  expect(first.status()).toBe(200);
  const saved = await first.json();
  assertApi(saved, "Preferences");
  expect(saved.revision).toBe(1);
  const replay = await request.put("/api/v1/preferences", {
    headers: headers(),
    data: input,
  });
  expect(await replay.json()).toEqual(saved);
  const different = await request.put("/api/v1/preferences", {
    headers: headers(),
    data: { ...input, fontSize: 24 },
  });
  expect(different.status()).toBe(409);
  expect((await different.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
  const stale = await request.put("/api/v1/preferences", {
    headers: headers(),
    data: prefs(0),
  });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).error.details.currentRevision).toBe(1);
  expect(
    (await (await request.get("/api/v1/me")).json()).preferences.revision,
  ).toBe(1);
});
test("P04 QA-D03/D06 progress moves back whilefurthest/completed staymonotonic; duplicateack staysoriginal", async ({
  request,
}) => {
  const far = await request.put("/api/v1/progress/post-office", {
    headers: headers(),
    data: progress(4, 3),
  });
  expect(far.status()).toBe(200);
  expect((await far.json()).furthestOrdinal).toBe(27);
  const conflict = await request.put("/api/v1/progress/post-office", {
    headers: headers(),
    data: progress(),
  });
  expect(conflict.status()).toBe(409);
  const error = await conflict.json();
  assertApi(error, "Error");
  expect(error.error.details.currentProgress.furthestOrdinal).toBe(27);
  const back = await request.put("/api/v1/progress/post-office", {
    headers: headers(),
    data: progress(0, 0, 1),
  });
  expect((await back.json()).furthestOrdinal).toBe(27);
  expect(
    (
      await request.put("/api/v1/progress/post-office", {
        headers: headers(),
        data: progress(0, 0, 2, true),
      })
    ).status(),
  ).toBe(400);
  const last = progress(5, 5, 2, true);
  const complete = await (
    await request.put("/api/v1/progress/post-office", {
      headers: headers(),
      data: last,
    })
  ).json();
  expect(complete.completed).toBe(true);
  expect(complete.revision).toBe(3);
  const backwards = await (
    await request.put("/api/v1/progress/post-office", {
      headers: headers(),
      data: progress(0, 1, 3),
    })
  ).json();
  expect(backwards).toMatchObject({
    completed: true,
    furthestOrdinal: 35,
    revision: 4,
  });
  expect(
    await (
      await request.put("/api/v1/progress/post-office", {
        headers: headers(),
        data: last,
      })
    ).json(),
  ).toEqual(complete);
  const me = await (await request.get("/api/v1/me")).json();
  expect(me.progress[0].revision).toBe(4);
  expect(me.progress[0].beatId).toBe("mail-s01-b02");
});
test("P04 QA-D05 concurrentinitial writes serialize bysession and onlyone winsCAS", async ({
  request,
}) => {
  const inputs = [progress(0, 1), progress(1, 1)];
  const results = await Promise.all(
    inputs.map((data) =>
      request.put("/api/v1/progress/post-office", { headers: headers(), data }),
    ),
  );
  expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
  const index = results.findIndex((r) => r.status() === 409);
  const retry = await request.put("/api/v1/progress/post-office", {
    headers: headers(),
    data: { ...inputs[index], expectedRevision: 1 },
  });
  expect(retry.status()).toBe(200);
  expect((await retry.json()).revision).toBe(2);
});
test("P04 operation IDs cannot be reused on differentroutes; failedCAS has no receipt", async ({
  request,
}) => {
  const input = prefs();
  await request.put("/api/v1/preferences", { headers: headers(), data: input });
  const reused = await request.put("/api/v1/progress/post-office", {
    headers: headers(),
    data: { ...progress(), operationId: input.operationId },
  });
  expect(reused.status()).toBe(409);
  expect((await reused.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
  const fail = prefs(100);
  expect(
    (
      await request.put("/api/v1/preferences", {
        headers: headers(),
        data: fail,
      })
    ).status(),
  ).toBe(409);
  expect(
    Number(
      (
        await owner.query(
          "SELECT count(*) FROM firstscene.mutation_receipts WHERE operation_id=$1",
          [fail.operationId],
        )
      ).rows[0].count,
    ),
  ).toBe(0);
});
test("P04 content/anchor/version/input guards rejectbeforestoreddata changes", async ({
  request,
}) => {
  for (const data of [
    { ...progress(), contentHash: "a".repeat(64) },
    { ...progress(), contentVersion: 2 },
  ]) {
    const response = await request.put("/api/v1/progress/post-office", {
      headers: headers(),
      data,
    });
    expect(response.status()).toBe(409);
    expect((await response.json()).error.code).toBe("CONTENT_CHANGED");
  }
  expect(
    (
      await request.put("/api/v1/progress/post-office", {
        headers: headers(),
        data: { ...progress(), beatId: "mail-s99-b99" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.put("/api/v1/progress/not-a-story", {
        headers: headers(),
        data: progress(),
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.put("/api/v1/preferences", {
        headers: headers(),
        data: { ...prefs(), sessionId: "foreign" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (await (await request.get("/api/v1/me")).json()).progress,
  ).toHaveLength(0);
});
test("P04 realA/Bwrites and deletes remaincookieowned; bookmark204replay/staletargetcleanup works", async ({
  request,
  playwright,
  baseURL,
}) => {
  const a = await request.post("/api/v1/bookmarks/post-office/__story__", {
    headers: headers(),
    data: {},
  });
  expect(a.status()).toBe(405);
  for (const target of ["__story__", "mail-s02-b02"]) {
    const response = await request.put(
      "/api/v1/bookmarks/post-office/" + target,
      {
        headers: headers(),
        data: { contentVersion: 1, operationId: randomUUID() },
      },
    );
    expect(response.status()).toBe(200);
    assertApi(await response.json(), "Bookmark");
  }
  const b = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: headers(),
  });
  try {
    await b.post("/api/v1/session", { data: {} });
    expect(
      (
        await b.delete("/api/v1/bookmarks/post-office/__story__", {
          data: { operationId: randomUUID() },
        })
      ).status(),
    ).toBe(204);
    expect((await (await b.get("/api/v1/me")).json()).bookmarks).toHaveLength(
      0,
    );
    expect(
      (await (await request.get("/api/v1/me")).json()).bookmarks,
    ).toHaveLength(2);
  } finally {
    await b.dispose();
  }
  const operationId = randomUUID();
  for (let i = 0; i < 2; i++)
    expect(
      (
        await request.delete("/api/v1/bookmarks/post-office/__story__", {
          headers: headers(),
          data: { operationId },
        })
      ).status(),
    ).toBe(204);
  expect(
    (
      await request.delete("/api/v1/bookmarks/post-office/old-removed-beat", {
        headers: headers(),
        data: { operationId: randomUUID() },
      })
    ).status(),
  ).toBe(204);
  expect(
    (await (await request.get("/api/v1/me")).json()).bookmarks,
  ).toHaveLength(1);
});
test("P04 quota64 staysatomic under65concurrent distincttargets and canrecoverafterdelete", async ({
  request,
}) => {
  const targets = stories
    .flatMap((s) =>
      [
        "__story__",
        ...s.scenes.flatMap((scene: { beats: { id: string }[] }) =>
          scene.beats.map((b) => b.id),
        ),
      ].map((target) => ({
        storyId: s.id,
        target,
        contentVersion: s.version,
        operationId: randomUUID(),
      })),
    )
    .slice(0, 65);
  const responses = await Promise.all(
    targets.map((t) =>
      request.put(`/api/v1/bookmarks/${t.storyId}/${t.target}`, {
        headers: headers(),
        data: { contentVersion: t.contentVersion, operationId: t.operationId },
      }),
    ),
  );
  expect(responses.filter((r) => r.status() === 200)).toHaveLength(64);
  expect(responses.filter((r) => r.status() === 429)).toHaveLength(1);
  const failedIndex = responses.findIndex((r) => r.status() === 429);
  expect((await responses[failedIndex]!.json()).error.code).toBe(
    "BOOKMARK_LIMIT",
  );
  const successful = targets[responses.findIndex((r) => r.status() === 200)]!;
  await request.delete(
    `/api/v1/bookmarks/${successful.storyId}/${successful.target}`,
    { headers: headers(), data: { operationId: randomUUID() } },
  );
  const retry = targets[failedIndex]!;
  expect(
    (
      await request.put(`/api/v1/bookmarks/${retry.storyId}/${retry.target}`, {
        headers: headers(),
        data: {
          contentVersion: retry.contentVersion,
          operationId: retry.operationId,
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await (await request.get("/api/v1/me")).json()).bookmarks,
  ).toHaveLength(64);
});
test("P04 expiredreceipt canbereused withfreshCAS ratherthanunique-keyfailure", async ({
  request,
}) => {
  const first = prefs();
  expect(
    (
      await request.put("/api/v1/preferences", {
        headers: headers(),
        data: first,
      })
    ).status(),
  ).toBe(200);
  await owner.query(
    "UPDATE firstscene.mutation_receipts SET created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour' WHERE operation_id=$1",
    [first.operationId],
  );
  const response = await request.put("/api/v1/preferences", {
    headers: headers(),
    data: { ...first, expectedRevision: 1 },
  });
  expect(response.status()).toBe(200);
  expect((await response.json()).revision).toBe(2);
});
test("P04 realSQLlocktimeout rollsback dataandreceipt andsameoperationcanretry", async ({
  request,
}) => {
  const lock = await owner.connect();
  const input = prefs();
  let response;
  try {
    await lock.query("BEGIN");
    await lock.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
    await lock.query(
      "LOCK TABLE firstscene.preferences IN ACCESS EXCLUSIVE MODE",
    );
    response = await request.put("/api/v1/preferences", {
      headers: headers(),
      data: input,
    });
  } finally {
    try {
      await lock.query("ROLLBACK");
    } finally {
      lock.release();
    }
  }
  expect(response!.status()).toBe(503);
  assertApi(await response!.json(), "Error");
  expect(
    Number(
      (
        await owner.query(
          "SELECT count(*) FROM firstscene.mutation_receipts WHERE operation_id=$1",
          [input.operationId],
        )
      ).rows[0].count,
    ),
  ).toBe(0);
  const retry = await request.put("/api/v1/preferences", {
    headers: headers(),
    data: input,
  });
  expect(retry.status()).toBe(200);
  expect((await retry.json()).revision).toBe(1);
});

test("P04 generalwrite120perminute applies even to idempotent replays", async ({
  request,
}) => {
  const input = prefs();
  const responses = await Promise.all(
    Array.from({ length: 241 }, () =>
      request.put("/api/v1/preferences", { headers: headers(), data: input }),
    ),
  );
  expect(
    responses.every(
      (response) => response.status() === 200 || response.status() === 429,
    ),
  ).toBe(true);
  expect(responses.some((response) => response.status() === 429)).toBe(true);
  for (const response of responses.filter(
    (response) => response.status() === 429,
  )) {
    expect((await response.json()).error.code).toBe("RATE_LIMITED");
    expect(Number(response.headers()["retry-after"])).toBeGreaterThan(0);
  }
  const me = await (await request.get("/api/v1/me")).json();
  expect(me.preferences.revision).toBe(1);
});
