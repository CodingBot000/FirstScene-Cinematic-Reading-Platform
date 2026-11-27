import { spawnSync } from "node:child_process";
const contracts = spawnSync("pnpm", ["check:generated-contracts"], {
  stdio: "inherit",
});
if (contracts.status !== 0) process.exit(contracts.status ?? 1);
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
