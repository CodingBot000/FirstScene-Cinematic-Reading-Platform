import { randomBytes, randomUUID, createHash, createHmac } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { validSessionNetwork } from "./request-network.js";
import type { SessionNetworkScope } from "./request-network.js";
import { ApiError, assertDeadline } from "./contracts.js";
import type {
  SessionContext,
  SessionDto,
  MeDto,
  PreferencesDto,
  ProgressDto,
  BookmarkDto,
} from "./contracts.js";
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest();
export function validSessionToken(token: unknown): token is string {
  return (
    typeof token === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(token) &&
    Buffer.from(token, "base64url").length === 32
  );
}
export async function authenticateSession(
  pool: Pool,
  token: string | null,
): Promise<SessionContext | null> {
  if (!validSessionToken(token)) return null;
  const row = (
    await pool.query<{ id: string; epoch: string; expires_at: Date }>(
      "SELECT id,epoch,expires_at FROM firstscene.sessions WHERE token_hash=$1 AND expires_at>now()",
      [tokenHash(token)],
    )
  ).rows[0];
  return row
    ? { id: row.id, epoch: row.epoch, expiresAt: row.expires_at.toISOString() }
    : null;
}
export async function consumeRate(
  pool: Pool | PoolClient,
  secret: string,
  scope: string,
  limit: number,
  windowSeconds: number,
) {
  if (secret.length < 32) throw new Error("RATE_SECRET_REQUIRED");
  const key = createHmac("sha256", secret).update(scope).digest();
  const result = await pool.query<{ count: number; retry_after: number }>(
    `INSERT INTO firstscene.rate_buckets(bucket_key,window_start,count,expires_at) VALUES($1,to_timestamp(floor(extract(epoch from now())/$2)*$2),1,to_timestamp(floor(extract(epoch from now())/$2)*$2)+interval '15 minutes') ON CONFLICT(bucket_key,window_start) DO UPDATE SET count=least(firstscene.rate_buckets.count+1,$3+1) RETURNING count,ceil(extract(epoch from(window_start+($2||' seconds')::interval-now())))::int AS retry_after`,
    [key, windowSeconds, limit],
  );
  const row = result.rows[0]!;
  if (row.count > limit) {
    const error = new ApiError(
      429,
      "RATE_LIMITED",
      "잠시 후 다시 시도해 주세요.",
    );
    error.retryAfter = Math.max(1, row.retry_after);
    throw error;
  }
  return Math.max(1, row.retry_after);
}
export async function issueSession(
  pool: Pool,
  secret: string,
  existingToken: string | null,
  network: SessionNetworkScope | null,
  deadline = Date.now() + 10000,
) {
  assertDeadline(deadline);
  const current = await authenticateSession(pool, existingToken);
  if (current)
    return {
      session: {
        epoch: current.epoch,
        expiresAt: current.expiresAt,
      } satisfies SessionDto,
      token: null,
    };
  if (!validSessionNetwork(network))
    throw new ApiError(
      503,
      "NETWORK_IDENTITY_REQUIRED",
      "기록 저장을 시작하지 못했어요. 잠시 후 다시 확인해 주세요.",
    );
  await consumeRate(pool, secret, "session:create:" + network, 30, 900);
  const token = randomBytes(32).toString("base64url"),
    id = randomUUID(),
    epoch = randomUUID();
  const client = await pool.connect();
  try {
    assertDeadline(deadline);
    await client.query("BEGIN");
    const row = (
      await client.query<{ expires_at: Date }>(
        "INSERT INTO firstscene.sessions(id,epoch,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '30 days') RETURNING expires_at",
        [id, epoch, tokenHash(token)],
      )
    ).rows[0]!;
    await client.query(
      "INSERT INTO firstscene.preferences(session_id) VALUES($1)",
      [id],
    );
    assertDeadline(deadline);
    await client.query("COMMIT");
    return {
      session: { epoch, expiresAt: row.expires_at.toISOString() },
      token,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function readMe(
  pool: Pool,
  context: SessionContext,
): Promise<MeDto> {
  const [prefs, progress, bookmarks] = await Promise.all([
    pool.query(
      "SELECT mode,effects,font_size,theme,revision FROM firstscene.preferences WHERE session_id=$1",
      [context.id],
    ),
    pool.query(
      "SELECT story_id,content_version,content_hash,scene_id,beat_id,fraction,furthest_ordinal,completed,revision,updated_at FROM firstscene.reading_progress WHERE session_id=$1 ORDER BY updated_at DESC",
      [context.id],
    ),
    pool.query(
      "SELECT story_id,target_id,content_version,created_at FROM firstscene.bookmarks WHERE session_id=$1 ORDER BY created_at DESC",
      [context.id],
    ),
  ]);
  const p = prefs.rows[0];
  if (!p)
    throw new ApiError(
      401,
      "SESSION_EXPIRED",
      "독서 기록의 저장 기간이 지났어요.",
    );
  return {
    session: { epoch: context.epoch, expiresAt: context.expiresAt },
    preferences: {
      mode: p.mode,
      effects: p.effects,
      fontSize: Number(p.font_size),
      theme: p.theme,
      revision: Number(p.revision),
    } as PreferencesDto,
    progress: progress.rows.map(
      (r) =>
        ({
          storyId: r.story_id,
          contentVersion: Number(r.content_version),
          contentHash: r.content_hash,
          sceneId: r.scene_id,
          beatId: r.beat_id,
          fraction: Number(r.fraction),
          furthestOrdinal: Number(r.furthest_ordinal),
          completed: r.completed,
          revision: Number(r.revision),
          updatedAt: r.updated_at.toISOString(),
        }) as ProgressDto,
    ),
    bookmarks: bookmarks.rows.map(
      (r) =>
        ({
          storyId: r.story_id,
          targetId: r.target_id,
          contentVersion: Number(r.content_version),
          createdAt: r.created_at.toISOString(),
        }) as BookmarkDto,
    ),
    serverPersistence: true,
  };
}
