import { Pool } from "pg";
export { Pool };
export type { PoolClient, QueryResultRow } from "pg";
export function createPool(connectionString: string, maximum = 2): Pool {
  if (!connectionString) throw new Error("DATABASE_URL_REQUIRED");
  const url = new URL(connectionString);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname.slice(1)
  )
    throw new Error("DATABASE_URL_INVALID");
  const local = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(
    url.hostname,
  );
  if (!local) {
    if (url.searchParams.get("sslmode") === "disable")
      throw new Error("REMOTE_TLS_REQUIRED");
    for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
      url.searchParams.delete(key);
  }
  const pool = new Pool({
    connectionString: url.toString(),
    max: Math.min(2, Math.max(1, maximum)),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    query_timeout: 10000,
    idle_in_transaction_session_timeout: 5000,
    application_name: "firstscene",
    ...(local ? {} : { ssl: { rejectUnauthorized: true } }),
  });
  pool.on("error", () => {
    /* The request layer emits redacted availability errors. */
  });
  return pool;
}
export function assertOwnedLocalUrl(connectionString: string): URL {
  const url = new URL(connectionString);
  if (
    !["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname) ||
    !/^\/firstscene_(?:dev|test_[a-f0-9]+|ci)$/.test(url.pathname)
  )
    throw new Error("OWNED_LOCAL_DATABASE_REQUIRED");
  return url;
}
