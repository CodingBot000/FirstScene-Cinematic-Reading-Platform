import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
export async function migrateDatabase(pool: Pool, directory: string) {
  const files = (await readdir(directory))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
    .sort();
  if (!files.length) throw new Error("MIGRATIONS_REQUIRED");
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('firstscene:migrations:v1'))",
    );
    const version = Number(
      (await client.query("SHOW server_version_num")).rows[0]
        .server_version_num,
    );
    if (version < 170000 || version >= 180000)
      throw new Error("POSTGRES17_REQUIRED");
    await client.query("CREATE SCHEMA IF NOT EXISTS firstscene");
    await client.query("REVOKE ALL ON SCHEMA firstscene FROM PUBLIC");
    await client.query(
      "CREATE TABLE IF NOT EXISTS firstscene.schema_migrations(version text PRIMARY KEY, sha256 char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const file of files) {
      const bytes = await readFile(path.join(directory, file));
      const sha = createHash("sha256").update(bytes).digest("hex");
      const prior = await client.query<{ sha256: string }>(
        "SELECT sha256 FROM firstscene.schema_migrations WHERE version=$1",
        [file],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].sha256 !== sha)
          throw new Error("MIGRATION_CHECKSUM_DRIFT " + file);
        continue;
      }
      await client.query(bytes.toString("utf8"));
      await client.query(
        "INSERT INTO firstscene.schema_migrations(version,sha256) VALUES($1,$2)",
        [file, sha],
      );
      applied.push(file);
    }
    await client.query("COMMIT");
    return { applied, checked: files.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
const identifier = (name: string) => {
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(name))
    throw new Error("UNSAFE_SQL_IDENTIFIER");
  return '"' + name + '"';
};
export async function ensureRuntimeRole(
  owner: Pool,
  role: string,
  password: string,
) {
  if (
    !/^firstscene_[a-z0-9_]+$/.test(role) ||
    password.includes("\0") ||
    password.length < 32
  )
    throw new Error("DEDICATED_RUNTIME_ROLE_REQUIRED");
  const quoted = identifier(role);
  const escaped = "'" + password.replaceAll("'", "''") + "'";
  const client = await owner.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('firstscene:runtime-role:v1'))",
    );
    const databaseName = (
      await client.query<{ current_database: string }>(
        "SELECT current_database()",
      )
    ).rows[0]!.current_database;
    if (!/^firstscene_(?:dev|test_[a-f0-9]+|ci)$/.test(databaseName))
      throw new Error("DEDICATED_DATABASE_REQUIRED");
    const existing = await client.query<{
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolbypassrls: boolean;
      rolinherit: boolean;
      rolcanlogin: boolean;
    }>(
      "SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolinherit,rolcanlogin FROM pg_roles WHERE rolname=$1",
      [role],
    );
    const found = existing.rows[0];
    if (found) {
      if (
        found.rolsuper ||
        found.rolcreatedb ||
        found.rolcreaterole ||
        found.rolbypassrls ||
        found.rolinherit ||
        !found.rolcanlogin
      )
        throw new Error("RUNTIME_ROLE_PRIVILEGE_MISMATCH");
    } else
      await client.query(
        `CREATE ROLE ${quoted} LOGIN PASSWORD ${escaped} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
      );
    const memberships = await client.query<{ count: string }>(
      "SELECT count(*) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)",
      [role],
    );
    if (Number(memberships.rows[0]!.count) !== 0)
      throw new Error("RUNTIME_ROLE_MEMBERSHIP_FORBIDDEN");
    const database = identifier(databaseName);
    await client.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
    await client.query(`GRANT CONNECT ON DATABASE ${database} TO ${quoted}`);
    await client.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
    await client.query(`GRANT USAGE ON SCHEMA firstscene TO ${quoted}`);
    for (const table of [
      "sessions",
      "preferences",
      "reading_progress",
      "bookmarks",
      "mutation_receipts",
      "feedback",
      "rate_buckets",
    ])
      await client.query(
        `GRANT SELECT,INSERT,UPDATE,DELETE ON firstscene.${identifier(table)} TO ${quoted}`,
      );
    await client.query(
      `REVOKE ALL ON firstscene.schema_migrations FROM ${quoted}`,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
