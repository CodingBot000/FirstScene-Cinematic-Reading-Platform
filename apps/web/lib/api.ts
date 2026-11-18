import "server-only";
import {
  createPool,
  deriveHttpPolicy,
  authenticateSession,
  requestToken,
  validSessionToken,
  ApiError,
  assertOwnedLocalUrl,
  cleanupExpired,
  shouldRunRequestCleanup,
} from "@firstscene/server-data";
import type { Pool } from "@firstscene/server-data";
let pool: Pool | undefined, validated: Promise<Pool> | undefined;
export function dataPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL ?? "";
    if (process.env.DEPLOY_TARGET === "local") assertOwnedLocalUrl(url);
    pool = createPool(url);
  }
  return pool;
}
export async function runtimePool() {
  if (!validated)
    validated = dataPool()
      .query(
        "SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolinherit,(SELECT count(*) FROM pg_auth_members WHERE member=pg_roles.oid) AS memberships,has_schema_privilege('firstscene','CREATE') AS schema_create,has_table_privilege(current_user,'firstscene.schema_migrations','SELECT') AS migration_read FROM pg_roles WHERE rolname=current_user",
      )
      .then((result) => {
        const r = result.rows[0];
        if (
          !r ||
          r.rolsuper ||
          r.rolcreatedb ||
          r.rolcreaterole ||
          r.rolbypassrls ||
          r.rolinherit ||
          Number(r.memberships) !== 0 ||
          r.schema_create ||
          r.migration_read
        )
          throw new Error("RUNTIME_ROLE_NOT_RESTRICTED");
        return dataPool();
      })
      .catch((error) => {
        validated = undefined;
        throw error;
      });
  const ready = await validated;
  if (shouldRunRequestCleanup(process.env)) await cleanupExpired(ready, 5);
  return ready;
}
export function httpPolicy() {
  return deriveHttpPolicy(
    process.env.APP_ORIGIN ?? "",
    process.env.DEPLOY_TARGET ?? "",
  );
}
export function rateSecret() {
  const secret = process.env.RATE_LIMIT_HMAC_SECRET ?? "";
  if (secret.length < 32) throw new Error("RATE_SECRET_REQUIRED");
  return secret;
}
export async function requireSession(request: Request) {
  const token = requestToken(request, httpPolicy());
  if (!validSessionToken(token))
    throw new ApiError(
      401,
      "SESSION_REQUIRED",
      "이 브라우저의 독서 기록이 아직 없어요.",
    );
  const session = await authenticateSession(await runtimePool(), token);
  if (!session)
    throw new ApiError(
      401,
      "SESSION_REQUIRED",
      "이 브라우저의 독서 기록이 아직 없어요.",
    );
  return session;
}
