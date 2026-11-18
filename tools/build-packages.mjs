import { spawnSync } from "node:child_process";
const transport = spawnSync("node", ["tools/generate-transport.mjs"], {
  stdio: "inherit",
});
if (transport.status !== 0) process.exit(transport.status ?? 1);
const format = spawnSync(
  "pnpm",
  [
    "exec",
    "prettier",
    "--write",
    "apps/web/features/reading-sync/transport.generated.ts",
  ],
  { stdio: "inherit" },
);
if (format.status !== 0) process.exit(format.status ?? 1);
for (const name of [
  "tokens",
  "story-schema",
  "ui",
  "reader-core",
  "reader-react",
  "content-compiler",
  "server-data",
]) {
  const result = spawnSync(
    "pnpm",
    ["--filter", "@firstscene/" + name, "build"],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
