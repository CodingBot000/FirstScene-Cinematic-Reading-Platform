import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import {
  createPool,
  assertOwnedLocalUrl,
  migrateDatabase,
  ensureRuntimeRole,
} from "../../packages/server-data/dist/index.js";
import { root } from "./environment.mjs";
import {
  ownedCiReceipt,
  privateEnvironment,
  exportGithub,
} from "./ci-service.mjs";
let owner;
try {
  const receipt = ownedCiReceipt();
  const admin = privateEnvironment(receipt.adminEnvironment);
  if (
    !process.env.DIRECT_DATABASE_URL ||
    process.env.DIRECT_DATABASE_URL !== admin.DIRECT_DATABASE_URL ||
    process.env.FIRSTSCENE_CI_DATABASE_MARKER !== receipt.marker
  )
    throw new Error("CI_ADMIN_ENVIRONMENT_MISMATCH");
  const url = assertOwnedLocalUrl(process.env.DIRECT_DATABASE_URL);
  if (
    url.pathname !== "/firstscene_ci" ||
    url.username !== "firstscene_ci_owner" ||
    Number(url.port) !== receipt.port
  )
    throw new Error("CI_DATABASE_TARGET_INVALID");
  owner = createPool(url.toString(), 1);
  const metadata = (
    await owner.query(
      "SELECT current_database() AS name,current_user AS owner,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()",
    )
  ).rows[0];
  if (
    metadata?.name !== "firstscene_ci" ||
    metadata.owner !== "firstscene_ci_owner" ||
    metadata.marker !== "FirstScene disposable CI " + receipt.marker
  )
    throw new Error("CI_DATABASE_MARKER_REQUIRED");
  const databases = (
    await owner.query(
      "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname<>'postgres'",
    )
  ).rows;
  if (
    databases.some(
      (row) =>
        row.datname !== "firstscene_ci" &&
        !/^firstscene_test_[a-f0-9]+$/.test(row.datname),
    )
  )
    throw new Error("CI_CLUSTER_CONTAINS_NON_TEST_DATABASE");
  const migration = await migrateDatabase(
    owner,
    path.join(root, "database/migrations"),
  );
  let runtime;
  if (fs.existsSync(receipt.runtimeEnvironment))
    runtime = privateEnvironment(receipt.runtimeEnvironment);
  else {
    const runtimeUrl = new URL(url);
    runtimeUrl.username =
      "firstscene_ci_runtime_" + randomUUID().replaceAll("-", "").slice(0, 16);
    runtimeUrl.password = randomBytes(32).toString("hex");
    await ensureRuntimeRole(owner, runtimeUrl.username, runtimeUrl.password);
    runtime = {
      DATABASE_URL: runtimeUrl.toString(),
      RATE_LIMIT_HMAC_SECRET: randomBytes(32).toString("hex"),
      APP_ORIGIN: "http://127.0.0.1:3100",
      DEPLOY_TARGET: "local",
    };
    fs.writeFileSync(
      receipt.runtimeEnvironment,
      Object.entries(runtime)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n") + "\n",
      { flag: "wx", mode: 0o600 },
    );
  }
  const pool = createPool(runtime.DATABASE_URL, 1);
  try {
    const r = (
      await pool.query(
        "SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolinherit,(SELECT count(*) FROM pg_auth_members WHERE member=pg_roles.oid) AS memberships,has_schema_privilege('firstscene','CREATE') AS schema_create,has_table_privilege(current_user,'firstscene.schema_migrations','SELECT') AS migrations_read FROM pg_roles WHERE rolname=current_user",
      )
    ).rows[0];
    if (
      !r ||
      r.rolsuper ||
      r.rolcreatedb ||
      r.rolcreaterole ||
      r.rolbypassrls ||
      r.rolinherit ||
      Number(r.memberships) ||
      r.schema_create ||
      r.migrations_read
    )
      throw new Error("CI_RUNTIME_ROLE_NOT_RESTRICTED");
  } finally {
    await pool.end();
  }
  exportGithub(runtime, [
    runtime.DATABASE_URL,
    new URL(runtime.DATABASE_URL).password,
    runtime.RATE_LIMIT_HMAC_SECRET,
  ]);
  console.log(
    JSON.stringify({
      status: "CI_DATABASE_PREPARED",
      database: "firstscene_ci",
      ...migration,
      runtimeRoleSeparated: true,
      randomCredentialsPrivate: true,
      exportedToGithubEnvironment: Boolean(
        process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_ENV,
      ),
      secretsPrinted: false,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: "CI_DATABASE_PREPARATION_FAILED",
      code: /^[A-Z_0-9]+$/.test(error.message)
        ? error.message
        : "CI_DATABASE_UNAVAILABLE",
      secretsPrinted: false,
    }),
  );
  process.exitCode = 1;
} finally {
  await owner?.end();
}
