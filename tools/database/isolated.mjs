import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  createPool,
  migrateDatabase,
  ensureRuntimeRole,
  assertOwnedLocalUrl,
} from "../../packages/server-data/dist/index.js";
import { loadLocalEnvironment, root } from "./environment.mjs";
export async function isolatedDatabase() {
  loadLocalEnvironment();
  const base = assertOwnedLocalUrl(process.env.DIRECT_DATABASE_URL);
  const name = "firstscene_test_" + randomUUID().replaceAll("-", "");
  const marker = "FirstScene disposable test " + randomUUID();
  const admin = createPool(base.toString(), 1);
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.query(`COMMENT ON DATABASE "${name}" IS '${marker}'`);
  const ownerUrl = new URL(base);
  ownerUrl.pathname = "/" + name;
  const runtimeUrl = new URL(process.env.DATABASE_URL);
  runtimeUrl.pathname = "/" + name;
  const owner = createPool(ownerUrl.toString(), 1),
    runtime = createPool(runtimeUrl.toString());
  const directory = path.join(root, "database/migrations");
  const cleanup = async () => {
    await runtime.end();
    await owner.end();
    const row = (
      await admin.query(
        "SELECT shobj_description(oid,'pg_database') AS description FROM pg_database WHERE datname=$1",
        [name],
      )
    ).rows[0];
    if (row?.description !== marker)
      throw new Error("TEST_DATABASE_OWNERSHIP_CHANGED");
    await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  };
  try {
    await migrateDatabase(owner, directory);
    await ensureRuntimeRole(
      owner,
      decodeURIComponent(runtimeUrl.username),
      decodeURIComponent(runtimeUrl.password),
    );
  } catch (error) {
    await cleanup();
    throw error;
  }
  return {
    owner,
    runtime,
    name,
    directory,
    marker,
    directUrl: ownerUrl.toString(),
    runtimeUrl: runtimeUrl.toString(),
    cleanup,
  };
}
export async function verifyActiveTestDatabase(pool) {
  const row = (
    await pool.query(
      "SELECT current_database() AS name,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()",
    )
  ).rows[0];
  if (
    !row ||
    !/^firstscene_test_[a-f0-9]+$/.test(row.name) ||
    !row.marker?.startsWith("FirstScene disposable test ")
  )
    throw new Error("ACTIVE_ISOLATED_TEST_DATABASE_REQUIRED");
  return row;
}
