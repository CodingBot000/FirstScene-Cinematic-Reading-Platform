import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createPool, assertApi } from "@firstscene/server-data";
import type { Pool } from "@firstscene/server-data";
import { verifyActiveTestDatabase } from "../../tools/database/isolated.mjs";
let owner: Pool;
const headers = () => ({
  origin: process.env.FIRSTSCENE_TEST_ORIGIN!,
  "content-type": "application/json",
});
const input = () => ({
  storyId: "post-office",
  code: "comfortable",
  operationId: randomUUID(),
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
test("feedback rejects missing cookies, foreign origins, arbitrary text/time/session fields and unknown stories without rows", async ({
  request,
}) => {
  const p = input();
  expect(
    (
      await request.post("/api/v1/feedback", { headers: headers(), data: p })
    ).status(),
  ).toBe(401);
  await request.post("/api/v1/session", { headers: headers(), data: {} });
  for (const data of [
    { ...p, text: "arbitrary input" },
    { ...p, createdAt: "2026-11-18T15:00:00Z" },
    { ...p, sessionId: randomUUID() },
    { ...p, code: "unknown" },
  ]) {
    const r = await request.post("/api/v1/feedback", {
      headers: headers(),
      data,
    });
    expect(r.status()).toBe(400);
    assertApi(await r.json(), "Error");
  }
  expect(
    (
      await request.post("/api/v1/feedback", {
        headers: { ...headers(), origin: "https://other.example" },
        data: p,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/v1/feedback", {
        headers: headers(),
        data: { ...p, storyId: "not-a-story" },
      })
    ).status(),
  ).toBe(404);
  expect(
    Number(
      (await owner.query("SELECT count(*) FROM firstscene.feedback")).rows[0]
        .count,
    ),
  ).toBe(0);
});
test("12parallel feedback requests accept5 with nextKSTmidnight RetryAfter, replay201 and cookieA/B/story isolation", async ({
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
    const sa = await (await a.post("/api/v1/session", { data: {} })).json();
    await b.post("/api/v1/session", { data: {} });
    const inputs = Array.from({ length: 12 }, input);
    const rs = await Promise.all(
      inputs.map((data) => a.post("/api/v1/feedback", { data })),
    );
    expect(rs.filter((r) => r.status() === 201)).toHaveLength(5);
    expect(rs.filter((r) => r.status() === 429)).toHaveLength(7);
    const expected = Number(
      (
        await owner.query(
          "SELECT ceil(extract(epoch FROM ((date_trunc('day',clock_timestamp() AT TIME ZONE 'Asia/Seoul')+interval '1 day') AT TIME ZONE 'Asia/Seoul')-clock_timestamp()))::integer AS seconds",
        )
      ).rows[0].seconds,
    );
    for (const r of rs) {
      if (r.status() === 429) {
        const body = await r.json();
        expect(body.error.code).toBe("FEEDBACK_LIMIT");
        expect(Number(r.headers()["retry-after"])).toBeGreaterThan(0);
        expect(
          Math.abs(Number(r.headers()["retry-after"]) - expected),
        ).toBeLessThanOrEqual(2);
      } else {
        assertApi(await r.json(), "FeedbackAccepted");
        expect(r.headers()["cache-control"]).toContain("no-store");
      }
    }
    const accepted = inputs[rs.findIndex((r) => r.status() === 201)]!;
    expect(
      (await a.post("/api/v1/feedback", { data: accepted })).status(),
    ).toBe(201);
    expect(
      (
        await a.post("/api/v1/feedback", {
          data: { ...accepted, code: "too_fast" },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await a.post("/api/v1/feedback", {
          data: { ...input(), storyId: "tide-station" },
        })
      ).status(),
    ).toBe(201);
    expect((await b.post("/api/v1/feedback", { data: input() })).status()).toBe(
      201,
    );
    const counts = (
      await owner.query(
        "SELECT count(*) FROM firstscene.feedback WHERE session_id=(SELECT id FROM firstscene.sessions WHERE epoch=$1) AND story_id='post-office'",
        [sa.epoch],
      )
    ).rows[0];
    expect(Number(counts.count)).toBe(5);
    expect((await a.get("/api/v1/feedback")).status()).toBe(405);
  } finally {
    await a.dispose();
    await b.dispose();
  }
});
test("feedback respects body16KiB, shared operation routes, deletion cascade and stale cookie denial", async ({
  request,
}) => {
  await request.post("/api/v1/session", { headers: headers(), data: {} });
  const me = await (await request.get("/api/v1/me")).json();
  const p = input();
  const value = JSON.stringify(p);
  expect(
    (
      await request.post("/api/v1/feedback", {
        headers: headers(),
        data: " ".repeat(16384 - value.length) + value,
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await request.post("/api/v1/feedback", {
        headers: headers(),
        data: " ".repeat(16385 - value.length) + value,
      })
    ).status(),
  ).toBe(413);
  expect(
    (
      await request.put("/api/v1/preferences", {
        headers: headers(),
        data: {
          operationId: p.operationId,
          mode: "plain",
          effects: "reduced",
          fontSize: 22,
          theme: "light",
          expectedRevision: 0,
        },
      })
    ).status(),
  ).toBe(409);
  const sessionId = (
    await owner.query("SELECT id FROM firstscene.sessions WHERE epoch=$1", [
      me.session.epoch,
    ])
  ).rows[0].id;
  expect(
    (
      await owner.query(
        "SELECT 1 FROM firstscene.feedback WHERE session_id=$1",
        [sessionId],
      )
    ).rowCount,
  ).toBe(1);
  expect(
    (
      await request.delete("/api/v1/me", { headers: headers(), data: {} })
    ).status(),
  ).toBe(204);
  expect(
    Number(
      (
        await owner.query(
          "SELECT count(*) FROM firstscene.feedback WHERE session_id=$1",
          [sessionId],
        )
      ).rows[0].count,
    ),
  ).toBe(0);
  expect(
    (
      await request.post("/api/v1/feedback", {
        headers: headers(),
        data: input(),
      })
    ).status(),
  ).toBe(401);
});
