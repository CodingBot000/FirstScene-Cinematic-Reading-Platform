import { assertVolumeOwnership, recordNewVolume } from "./ownership.mjs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  bootstrapLocalEnvironment,
  loadLocalEnvironment,
  root,
} from "./environment.mjs";
import {
  createPool,
  assertOwnedLocalUrl,
  migrateDatabase,
  ensureRuntimeRole,
  cleanupExpired,
} from "../../packages/server-data/dist/index.js";
const action = process.argv[2];
try {
  if (action === "up") {
    const { envPath, port } = await bootstrapLocalEnvironment();
    const probe = spawnSync(
      "docker",
      [
        "ps",
        "-a",
        "--filter",
        "name=firstscene-local-postgres",
        "--format",
        "{{.ID}}",
      ],
      { encoding: "utf8" },
    );
    if (probe.status !== 0) throw new Error("DOCKER_UNAVAILABLE");
    for (const id of probe.stdout.trim().split("\n").filter(Boolean)) {
      const label = spawnSync(
        "docker",
        [
          "inspect",
          id,
          "--format",
          '{{index .Config.Labels "com.docker.compose.project.working_dir"}}',
        ],
        { encoding: "utf8" },
      );
      if (label.stdout.trim() !== root)
        throw new Error("CONTAINER_NAME_OWNED_ELSEWHERE");
    }
    const volumeExists = assertVolumeOwnership();
    const result = spawnSync(
      "docker",
      [
        "compose",
        "--env-file",
        envPath,
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        "60",
        "postgres",
      ],
      { cwd: root, stdio: "inherit" },
    );
    if (result.status !== 0) throw new Error("LOCAL_POSTGRES_START_FAILED");
    if (!volumeExists) recordNewVolume();
    console.log(
      JSON.stringify({
        status: "LOCAL_POSTGRES_RUNNING",
        host: "127.0.0.1",
        port,
        secretsPrinted: false,
      }),
    );
  } else if (action === "migrate") {
    loadLocalEnvironment();
    const direct = process.env.DIRECT_DATABASE_URL;
    assertOwnedLocalUrl(direct);
    const pool = createPool(direct, 1);
    try {
      const result = await migrateDatabase(
        pool,
        path.join(root, "database/migrations"),
      );
      const runtime = new URL(process.env.DATABASE_URL);
      await ensureRuntimeRole(
        pool,
        decodeURIComponent(runtime.username),
        decodeURIComponent(runtime.password),
      );
      console.log(
        JSON.stringify({
          status: "MIGRATED",
          ...result,
          runtimeRoleSeparated: true,
          secretsPrinted: false,
        }),
      );
    } finally {
      await pool.end();
    }
  } else if (action === "cleanup") {
    loadLocalEnvironment();
    assertVolumeOwnership();
    assertOwnedLocalUrl(process.env.DATABASE_URL);
    const pool = createPool(process.env.DATABASE_URL, 1);
    try {
      const total = { receipts: 0, rateBuckets: 0, sessions: 0 };
      let batches = 0;
      // At most 10,000 candidates per table, never an unbounded maintenance job.
      while (batches < 100) {
        const result = await cleanupExpired(pool, 100);
        batches++;
        for (const key of Object.keys(total)) total[key] += result[key];
        if (Object.values(result).every((n) => n < 100)) break;
      }
      console.log(
        JSON.stringify({
          status: "CLEANUP_COMPLETE",
          batches,
          deleted: total,
          bounded: true,
          secretsPrinted: false,
        }),
      );
    } finally {
      await pool.end();
    }
  } else throw new Error("UNKNOWN_DATABASE_COMMAND");
} catch (error) {
  console.error(
    JSON.stringify({
      status: "DATABASE_COMMAND_FAILED",
      code:
        error.code ??
        (error.message?.startsWith("MIGRATION_CHECKSUM_DRIFT")
          ? "MIGRATION_CHECKSUM_DRIFT"
          : error.message?.match(/^[A-Z0-9_]+$/)
            ? error.message
            : "DATABASE_FAILURE"),
      secretsPrinted: false,
    }),
  );
  process.exitCode = 1;
}
