import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Story } from "@firstscene/story-schema";
import {
  ApiError,
  assertApi,
  assertApiResponse,
  assertDeadline,
} from "./contracts.js";
import type {
  SessionContext,
  PreferencesDto,
  PreferencesWrite,
  ProgressDto,
  ProgressWrite,
  BookmarkDto,
  BookmarkWrite,
  FeedbackWrite,
  FeedbackAccepted,
  MutationInput,
  ApiSchemaName,
} from "./contracts.js";
import { feedbackPolicy, feedbackWindowQuery } from "./feedback-policy.js";
import { consumeRate } from "./session.js";
import { recordTransaction } from "./request-diagnostics.js";
type MutationResult<T> = { status: number; body: T | null };
type ProgressRow = {
  story_id: string;
  content_version: number;
  content_hash: string;
  scene_id: string;
  beat_id: string;
  fraction: string;
  furthest_ordinal: number;
  completed: boolean;
  revision: string;
  updated_at: Date;
};
const progressDto = (r: ProgressRow): ProgressDto => ({
  storyId: r.story_id,
  contentVersion: r.content_version,
  contentHash: r.content_hash,
  sceneId: r.scene_id,
  beatId: r.beat_id,
  fraction: Number(r.fraction),
  furthestOrdinal: r.furthest_ordinal,
  completed: r.completed,
  revision: Number(r.revision),
  updatedAt: r.updated_at.toISOString(),
});
const pathId = (value: string, special = false) => {
  if (
    (special && value === "__story__") ||
    /^[a-z][a-z0-9-]{1,63}$/.test(value)
  )
    return;
  throw new ApiError(
    400,
    "INVALID_INPUT",
    "올바른 이야기와 문장 위치를 선택해 주세요.",
  );
};
export function createStateRepository(
  pool: Pool,
  stories: readonly Story[],
  secret: string,
) {
  const catalog = new Map(
    stories.map((story) => [
      story.id,
      {
        story,
        beats: story.scenes.flatMap((scene) =>
          scene.beats.map((beat) => ({ id: beat.id, sceneId: scene.id })),
        ),
      },
    ]),
  );
  const storyFor = (id: string) => {
    pathId(id);
    const result = catalog.get(id);
    if (!result)
      throw new ApiError(404, "CONTENT_NOT_FOUND", "이야기를 찾을 수 없어요.");
    return result;
  };
  async function mutate<T>(
    context: SessionContext,
    operationId: string,
    route: string,
    body: object,
    schema: ApiSchemaName | null,
    write: (client: PoolClient) => Promise<MutationResult<T>>,
    deadline: number,
  ): Promise<MutationResult<T>> {
    assertDeadline(deadline);
    await consumeRate(pool, secret, "write:" + context.epoch, 120, 60);
    const values = Object.fromEntries(
      Object.entries(body)
        .filter(([key]) => key !== "operationId")
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    const hash = createHash("sha256")
      .update(route + "\n" + JSON.stringify(values))
      .digest("hex");
    const client = await pool.connect();
    const transactionStarted = performance.now();
    let outcome: Parameters<typeof recordTransaction>[1] = "failed";
    try {
      assertDeadline(deadline);
      await client.query("BEGIN");
      const locked = await client.query(
        "SELECT id FROM firstscene.sessions WHERE id=$1 AND epoch=$2 AND expires_at>now() FOR UPDATE",
        [context.id, context.epoch],
      );
      if (!locked.rowCount)
        throw new ApiError(
          401,
          "SESSION_EXPIRED",
          "저장 기간이 지나 새 독서 기록을 시작해요.",
        );
      const receipt = (
        await client.query<{
          request_hash: string;
          route: string;
          response_status: number;
          response_body: T | null;
          live: boolean;
        }>(
          "SELECT request_hash,route,response_status,response_body,expires_at>now() AS live FROM firstscene.mutation_receipts WHERE session_id=$1 AND operation_id=$2 FOR UPDATE",
          [context.id, operationId],
        )
      ).rows[0];
      if (receipt?.live) {
        if (receipt.route !== route || receipt.request_hash !== hash)
          throw new ApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "같은 요청 번호에 다른 내용이 들어왔어요.",
          );
        if (schema) assertApiResponse(receipt.response_body, schema);
        assertDeadline(deadline);
        await client.query("COMMIT");
        outcome = "replayed";
        return { status: receipt.response_status, body: receipt.response_body };
      }
      if (receipt)
        await client.query(
          "DELETE FROM firstscene.mutation_receipts WHERE session_id=$1 AND operation_id=$2",
          [context.id, operationId],
        );
      const result = await write(client);
      if (schema) assertApiResponse(result.body, schema);
      await client.query(
        "INSERT INTO firstscene.mutation_receipts(session_id,operation_id,request_hash,route,response_status,response_body,expires_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,now()+interval '24 hours')",
        [
          context.id,
          operationId,
          hash,
          route,
          result.status,
          JSON.stringify(result.body),
        ],
      );
      assertDeadline(deadline);
      await client.query("COMMIT");
      outcome = "committed";
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      outcome = "rolled-back";
      throw error;
    } finally {
      recordTransaction(transactionStarted, outcome);
      client.release();
    }
  }
  async function putPreferences(
    context: SessionContext,
    input: PreferencesWrite,
    deadline = Date.now() + 10000,
  ) {
    assertApi(input, "PreferencesWrite");
    return mutate<PreferencesDto>(
      context,
      input.operationId,
      "PUT /api/v1/preferences",
      input,
      "Preferences",
      async (client) => {
        const existing = (
          await client.query<{ revision: string }>(
            "SELECT revision FROM firstscene.preferences WHERE session_id=$1 FOR UPDATE",
            [context.id],
          )
        ).rows[0];
        if (!existing)
          throw new ApiError(
            503,
            "INVALID_SERVER_STATE",
            "설정 기록을 불러오지 못했어요.",
          );
        const revision = Number(existing.revision);
        if (input.expectedRevision !== revision)
          throw new ApiError(
            409,
            "REVISION_CONFLICT",
            "다른 탭에서 설정이 바뀌었어요.",
            { currentRevision: revision },
          );
        const row = (
          await client.query<{
            mode: PreferencesDto["mode"];
            effects: PreferencesDto["effects"];
            font_size: PreferencesDto["fontSize"];
            theme: PreferencesDto["theme"];
            revision: string;
          }>(
            "UPDATE firstscene.preferences SET mode=$2,effects=$3,font_size=$4,theme=$5,revision=revision+1,updated_at=now() WHERE session_id=$1 RETURNING mode,effects,font_size,theme,revision",
            [
              context.id,
              input.mode,
              input.effects,
              input.fontSize,
              input.theme,
            ],
          )
        ).rows[0]!;
        return {
          status: 200,
          body: {
            mode: row.mode,
            effects: row.effects,
            fontSize: row.font_size,
            theme: row.theme,
            revision: Number(row.revision),
          },
        };
      },
      deadline,
    );
  }
  async function putProgress(
    context: SessionContext,
    storyId: string,
    input: ProgressWrite,
    deadline = Date.now() + 10000,
  ) {
    assertApi(input, "ProgressWrite");
    const info = storyFor(storyId);
    if (
      input.contentVersion !== info.story.version ||
      input.contentHash !== info.story.contentHash
    )
      throw new ApiError(
        409,
        "CONTENT_CHANGED",
        "이야기 내용이 갱신됐어요. 임시 기록은 이 기기에 남겨두었어요.",
      );
    const ordinal = info.beats.findIndex(
      (beat) => beat.id === input.beatId && beat.sceneId === input.sceneId,
    );
    if (ordinal < 0)
      throw new ApiError(400, "INVALID_ANCHOR", "유효한 문장 위치가 아니에요.");
    if (input.completed && ordinal !== info.beats.length - 1)
      throw new ApiError(
        400,
        "INVALID_COMPLETION",
        "마지막 문장 뒤의 완독 버튼으로 기록해 주세요.",
      );
    return mutate<ProgressDto>(
      context,
      input.operationId,
      "PUT /api/v1/progress/" + storyId,
      input,
      "Progress",
      async (client) => {
        const old = (
          await client.query<ProgressRow>(
            "SELECT * FROM firstscene.reading_progress WHERE session_id=$1 AND story_id=$2 FOR UPDATE",
            [context.id, storyId],
          )
        ).rows[0];
        const revision = old ? Number(old.revision) : 0;
        if (input.expectedRevision !== revision)
          throw new ApiError(
            409,
            "REVISION_CONFLICT",
            "다른 탭의 읽기 위치와 조정이 필요해요.",
            {
              currentRevision: revision,
              ...(old ? { currentProgress: progressDto(old) } : {}),
            },
          );
        const row = (
          await client.query<ProgressRow>(
            "INSERT INTO firstscene.reading_progress(session_id,story_id,content_version,content_hash,scene_id,beat_id,fraction,furthest_ordinal,completed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(session_id,story_id) DO UPDATE SET content_version=excluded.content_version,content_hash=excluded.content_hash,scene_id=excluded.scene_id,beat_id=excluded.beat_id,fraction=excluded.fraction,furthest_ordinal=greatest(firstscene.reading_progress.furthest_ordinal,excluded.furthest_ordinal),completed=firstscene.reading_progress.completed OR excluded.completed,revision=firstscene.reading_progress.revision+1,updated_at=now() RETURNING *",
            [
              context.id,
              storyId,
              input.contentVersion,
              input.contentHash,
              input.sceneId,
              input.beatId,
              input.fraction,
              ordinal,
              input.completed,
            ],
          )
        ).rows[0]!;
        return { status: 200, body: progressDto(row) };
      },
      deadline,
    );
  }
  async function putBookmark(
    context: SessionContext,
    storyId: string,
    targetId: string,
    input: BookmarkWrite,
    deadline = Date.now() + 10000,
  ) {
    assertApi(input, "BookmarkWrite");
    const info = storyFor(storyId);
    pathId(targetId, true);
    if (input.contentVersion !== info.story.version)
      throw new ApiError(409, "CONTENT_CHANGED", "이야기 내용이 갱신됐어요.");
    if (
      targetId !== "__story__" &&
      !info.beats.some((beat) => beat.id === targetId)
    )
      throw new ApiError(404, "CONTENT_NOT_FOUND", "문장을 찾을 수 없어요.");
    return mutate<BookmarkDto>(
      context,
      input.operationId,
      `PUT /api/v1/bookmarks/${storyId}/${targetId}`,
      input,
      "Bookmark",
      async (client) => {
        const exists = (
          await client.query(
            "SELECT 1 FROM firstscene.bookmarks WHERE session_id=$1 AND story_id=$2 AND target_id=$3",
            [context.id, storyId, targetId],
          )
        ).rowCount;
        if (
          !exists &&
          Number(
            (
              await client.query(
                "SELECT count(*) FROM firstscene.bookmarks WHERE session_id=$1",
                [context.id],
              )
            ).rows[0].count,
          ) >= 64
        )
          throw new ApiError(
            429,
            "BOOKMARK_LIMIT",
            "저장 가능한 문장 수에 도달했어요. 기존 문장을 정리해 주세요.",
          );
        const row = (
          await client.query<{
            story_id: string;
            target_id: string;
            content_version: number;
            created_at: Date;
          }>(
            "INSERT INTO firstscene.bookmarks(session_id,story_id,target_id,content_version) VALUES($1,$2,$3,$4) ON CONFLICT(session_id,story_id,target_id) DO UPDATE SET content_version=excluded.content_version RETURNING story_id,target_id,content_version,created_at",
            [context.id, storyId, targetId, input.contentVersion],
          )
        ).rows[0]!;
        return {
          status: 200,
          body: {
            storyId: row.story_id,
            targetId: row.target_id,
            contentVersion: row.content_version,
            createdAt: row.created_at.toISOString(),
          },
        };
      },
      deadline,
    );
  }
  async function deleteBookmark(
    context: SessionContext,
    storyId: string,
    targetId: string,
    input: MutationInput,
    deadline = Date.now() + 10000,
  ) {
    assertApi(input, "Mutation");
    pathId(storyId);
    pathId(targetId, true);
    return mutate<null>(
      context,
      input.operationId,
      `DELETE /api/v1/bookmarks/${storyId}/${targetId}`,
      input,
      null,
      async (client) => {
        await client.query(
          "DELETE FROM firstscene.bookmarks WHERE session_id=$1 AND story_id=$2 AND target_id=$3",
          [context.id, storyId, targetId],
        );
        return { status: 204, body: null };
      },
      deadline,
    );
  }
  async function submitFeedback(
    context: SessionContext,
    input: FeedbackWrite,
    deadline = Date.now() + 10000,
  ) {
    assertApi(input, "FeedbackWrite");
    storyFor(input.storyId);
    return mutate<FeedbackAccepted>(
      context,
      input.operationId,
      "POST /api/v1/feedback",
      input,
      "FeedbackAccepted",
      async (client) => {
        // The durable feedback row also protects replay after the generic24h receipt expires.
        const prior = (
          await client.query<{ story_id: string; code: string }>(
            "SELECT story_id,code FROM firstscene.feedback WHERE session_id=$1 AND operation_id=$2",
            [context.id, input.operationId],
          )
        ).rows[0];
        if (prior) {
          if (prior.story_id !== input.storyId || prior.code !== input.code)
            throw new ApiError(
              409,
              "IDEMPOTENCY_CONFLICT",
              "같은 요청 번호에 다른 평가가 들어왔어요.",
            );
          return { status: 201, body: { accepted: true } };
        }
        const window = (
          await client.query<{
            instant: Date;
            starts_at: Date;
            resets_at: Date;
            retry_after: number;
          }>(feedbackWindowQuery, [feedbackPolicy.timeZone])
        ).rows[0]!;
        if (Date.parse(context.expiresAt) <= window.instant.getTime())
          throw new ApiError(
            401,
            "SESSION_EXPIRED",
            "독서 기록의 저장 기간이 지났어요.",
          );
        const count = Number(
          (
            await client.query(
              "SELECT count(*) FROM firstscene.feedback WHERE session_id=$1 AND story_id=$2 AND created_at >= $3 AND created_at < $4",
              [context.id, input.storyId, window.starts_at, window.resets_at],
            )
          ).rows[0].count,
        );
        if (count >= feedbackPolicy.dailyLimit) {
          const error = new ApiError(
            429,
            "FEEDBACK_LIMIT",
            "이 작품의 오늘 평가는 5회까지예요. 한국 시간 자정 이후 다시 보내 주세요.",
          );
          error.retryAfter = window.retry_after;
          throw error;
        }
        await client.query(
          "INSERT INTO firstscene.feedback(session_id,story_id,operation_id,code,created_at) VALUES($1,$2,$3,$4,$5)",
          [
            context.id,
            input.storyId,
            input.operationId,
            input.code,
            window.instant,
          ],
        );
        return { status: 201, body: { accepted: true } };
      },
      deadline,
    );
  }
  return {
    putPreferences,
    putProgress,
    putBookmark,
    deleteBookmark,
    submitFeedback,
  };
}
