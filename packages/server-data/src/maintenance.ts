import { createHash, createHmac } from "node:crypto";
import type { Pool } from "pg";
import { assertDeadline } from "./contracts.js";
import { validSessionToken } from "./session.js";

// Every statement is atomic and bounded; locked rows remain for a later run.
export async function cleanupExpired(pool: Pool, batchSize = 100) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000)
    throw new Error("CLEANUP_BATCH_INVALID");
  const counts = { receipts: 0, rateBuckets: 0, sessions: 0 };
  for (const [key, table, identity] of [
    ["receipts", "mutation_receipts", "session_id,operation_id"],
    ["rateBuckets", "rate_buckets", "bucket_key,window_start"],
    ["sessions", "sessions", "id"],
  ] as const) {
    const result = await pool.query(
      `WITH expired AS (SELECT ${identity} FROM firstscene.${table} WHERE expires_at<=now() ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED) DELETE FROM firstscene.${table} AS target USING expired WHERE ${identity
        .split(",")
        .map((column) => `target.${column}=expired.${column}`)
        .join(" AND ")}`,
      [batchSize],
    );
    counts[key] = result.rowCount ?? 0;
  }
  return counts;
}

// Deletion is the receipt exception: deleting the parent removes every receipt.
// Accept expired own tokens too, without ever accepting a client session id.
export async function deleteSession(
  pool: Pool,
  token: string | null,
  secret: string,
  deadline = Date.now() + 10000,
) {
  if (!validSessionToken(token)) return;
  if (secret.length < 32) throw new Error("RATE_SECRET_REQUIRED");
  const client = await pool.connect();
  try {
    assertDeadline(deadline);
    // Read the bucket committed by a writer that held the session lock.
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    const row = (
      await client.query<{ epoch: string }>(
        "DELETE FROM firstscene.sessions WHERE token_hash=$1 RETURNING epoch",
        [createHash("sha256").update(token).digest()],
      )
    ).rows[0];
    if (row)
      await client.query(
        "DELETE FROM firstscene.rate_buckets WHERE bucket_key=$1",
        [
          createHmac("sha256", secret)
            .update("write:" + row.epoch)
            .digest(),
        ],
      );
    assertDeadline(deadline);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
