import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
import { createPool } from "../../packages/server-data/dist/index.js";
import { root } from "./environment.mjs";
import { ownedCiReceipt, privateEnvironment } from "./ci-service.mjs";
const checks = [];
let owner, runtime, fakeGithubEnvironment;
function check(name, condition) {
  checks.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error("CI_PREPARATION_CHECK_FAILED");
}
try {
  const receipt = ownedCiReceipt();
  const admin = privateEnvironment(receipt.adminEnvironment),
    values = privateEnvironment(receipt.runtimeEnvironment);
  const knownSecrets = [
    admin.DIRECT_DATABASE_URL,
    new URL(admin.DIRECT_DATABASE_URL).password,
    values.DATABASE_URL,
    new URL(values.DATABASE_URL).password,
    values.RATE_LIMIT_HMAC_SECRET,
  ];
  function prepare(overrides = {}) {
    const child = spawnSync(
      process.execPath,
      ["tools/database/prepare-test.mjs"],
      {
        cwd: root,
        env: {
          ...process.env,
          ...admin,
          ...values,
          GITHUB_ACTIONS: "",
          GITHUB_ENV: "",
          ...overrides,
        },
        encoding: "utf8",
        timeout: 30000,
      },
    );
    const ordinary =
      child.stdout
        .split("\n")
        .filter((line) => !line.startsWith("::add-mask::"))
        .join("\n") + child.stderr;
    check(
      "preparation logs contain no known credential",
      knownSecrets.every((secret) => !ordinary.includes(secret)),
    );
    const line = ordinary
      .trim()
      .split("\n")
      .findLast((line) => line.startsWith("{"));
    return {
      exit: child.status,
      message: line ? JSON.parse(line) : null,
      protocol: child.stdout
        .split("\n")
        .filter((line) => line.startsWith("::add-mask::")),
    };
  }
  const normal = prepare();
  check(
    "marked service prepares idempotently",
    normal.exit === 0 && normal.message.status === "CI_DATABASE_PREPARED",
  );
  const wrongTarget = new URL(admin.DIRECT_DATABASE_URL);
  wrongTarget.pathname = "/firstscene_dev";
  const wrong = prepare({ DIRECT_DATABASE_URL: wrongTarget.toString() });
  check(
    "non-test URL rejected before connecting",
    wrong.exit === 1 && wrong.message.code === "CI_ADMIN_ENVIRONMENT_MISMATCH",
  );
  const missingFlag = prepare({ FIRSTSCENE_CI_DISPOSABLE: "" });
  check(
    "explicit disposable flag required",
    missingFlag.exit === 1 &&
      missingFlag.message.code === "EXPLICIT_DISPOSABLE_CI_REQUIRED",
  );
  owner = createPool(admin.DIRECT_DATABASE_URL, 1);
  runtime = createPool(values.DATABASE_URL, 1);
  await owner.query(
    "COMMENT ON DATABASE firstscene_ci IS 'FirstScene deliberate marker-negative fixture'",
  );
  try {
    const unmarked = prepare();
    check(
      "wrong database marker rejected",
      unmarked.exit === 1 &&
        unmarked.message.code === "CI_DATABASE_MARKER_REQUIRED",
    );
  } finally {
    await owner.query(
      `COMMENT ON DATABASE firstscene_ci IS 'FirstScene disposable CI ${receipt.marker}'`,
    );
  }
  for (const [name, sql] of [
    [
      "runtime cannot create tables",
      "CREATE TABLE firstscene.forbidden_ci_probe(id integer)",
    ],
    [
      "runtime cannot read migrations",
      "SELECT * FROM firstscene.schema_migrations",
    ],
  ]) {
    let code;
    try {
      await runtime.query(sql);
    } catch (error) {
      code = error.code;
    }
    check(name, code === "42501");
  }
  const flags = (
    await runtime.query(
      "SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolinherit,has_database_privilege(current_database(),'TEMP') AS temporary,(SELECT count(*) FROM pg_auth_members WHERE member=pg_roles.oid) AS memberships FROM pg_roles WHERE rolname=current_user",
    )
  ).rows[0];
  check(
    "runtime has no owner capabilities, inheritance or memberships",
    !flags.rolsuper &&
      !flags.rolcreatedb &&
      !flags.rolcreaterole &&
      !flags.rolbypassrls &&
      !flags.rolinherit &&
      !flags.temporary &&
      Number(flags.memberships) === 0,
  );
  fakeGithubEnvironment = path.join(receipt.directory, "github-env-self-test");
  fs.writeFileSync(fakeGithubEnvironment, "", { flag: "wx", mode: 0o600 });
  const github = prepare({
    GITHUB_ACTIONS: "true",
    GITHUB_ENV: fakeGithubEnvironment,
  });
  const exported = parseEnv(fs.readFileSync(fakeGithubEnvironment, "utf8"));
  check(
    "GitHub environment export uses generated runtime credentials",
    github.exit === 0 &&
      exported.DATABASE_URL === values.DATABASE_URL &&
      exported.RATE_LIMIT_HMAC_SECRET === values.RATE_LIMIT_HMAC_SECRET &&
      !exported.DIRECT_DATABASE_URL,
  );
  check(
    "mask protocol present only in private captured pipe",
    github.protocol.includes("::add-mask::" + values.DATABASE_URL) &&
      github.protocol.includes("::add-mask::" + values.RATE_LIMIT_HMAC_SECRET),
  );
  const version = (await owner.query("SHOW server_version")).rows[0]
    .server_version;
  fs.mkdirSync("evidence/ci", { recursive: true });
  fs.writeFileSync(
    "evidence/ci/prepare-test.json",
    JSON.stringify(
      {
        status: "PASS",
        observedAt: new Date().toISOString(),
        command:
          "CI=true FIRSTSCENE_CI_DISPOSABLE=1 node tools/database/verify-ci.mjs",
        postgresVersion: version,
        explicitlyOwnedDisposableService: true,
        operatingDatabaseTouched: false,
        hostedGithubWorkflowExecuted: false,
        maskProtocolTest:
          "Synthetic receiver; raw protocol stayed in a private parent pipe, never terminal/log output.",
        checks,
        secretsPrinted: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      status: "CI_PREPARATION_VERIFIED",
      checks: checks.length,
      secretsPrinted: false,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: "CI_PREPARATION_VERIFICATION_FAILED",
      code: /^[A-Z_0-9]+$/.test(error.message)
        ? error.message
        : "CI_VERIFICATION_UNAVAILABLE",
      secretsPrinted: false,
    }),
  );
  process.exitCode = 1;
} finally {
  if (fakeGithubEnvironment && fs.existsSync(fakeGithubEnvironment))
    fs.unlinkSync(fakeGithubEnvironment);
  await runtime?.end();
  await owner?.end();
}
