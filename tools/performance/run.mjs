import fs from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const directory = "evidence/performance/current";
fs.mkdirSync(directory, { recursive: true });
const file = directory + "/result.json";
const result = {
  status: "IN_PROGRESS",
  releaseReady: false,
  startedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  commands: [],
  artifacts: [],
  firstImages960: [],
  errors: [],
};
function write() {
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + "\n");
}
function sha(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function read(name) {
  const path = directory + "/" + name + ".json";
  const value = JSON.parse(fs.readFileSync(path, "utf8"));
  if (Date.parse(value.observedAt) < Date.parse(result.startedAt))
    throw new Error("STALE_PERFORMANCE_REPORT");
  result.artifacts.push({ path, sha256: sha(path) });
  return value;
}
write();
for (const [program, args] of [
  ["pnpm", ["storybook:build"]],
  ["pnpm", ["assets:verify"]],
  [process.execPath, ["tools/performance/collect-lighthouse.mjs"]],
  [process.execPath, ["tools/performance/collect-browser.mjs"]],
]) {
  const command = {
    command:
      (program === process.execPath ? "node" : program) + " " + args.join(" "),
    startedAt: new Date().toISOString(),
    exitCode: null,
  };
  result.commands.push(command);
  write();
  command.exitCode = await new Promise((resolve) => {
    const child = spawn(program, args, { stdio: "inherit" });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
  command.finishedAt = new Date().toISOString();
  write();
}
try {
  const navigation = read("navigation");
  if (
    navigation.status !== "NAVIGATION_BUDGETS_PASSED" ||
    navigation.runs.length !== 9 ||
    navigation.summary.length !== 3
  )
    throw new Error("NAVIGATION_GATE_FAILED");
  for (const run of navigation.runs) {
    if (sha(run.audit) !== run.auditSha256)
      throw new Error("NAVIGATION_HASH_MISMATCH");
    result.artifacts.push({ path: run.audit, sha256: run.auditSha256 });
  }
  const browserPath = directory + "/browser-results.json";
  const browser = JSON.parse(fs.readFileSync(browserPath, "utf8"));
  if (
    Date.parse(browser.stats.startTime) < Date.parse(result.startedAt) ||
    browser.stats.expected !== 4 ||
    browser.stats.unexpected ||
    browser.stats.skipped ||
    browser.stats.flaky
  )
    throw new Error("BROWSER_PERFORMANCE_GATE_FAILED");
  result.artifacts.push({ path: browserPath, sha256: sha(browserPath) });
  for (const engine of ["chromium", "webkit"]) {
    const lifecycle = read("lifecycle-perf-" + engine);
    if (
      lifecycle.status !== "PASS" ||
      lifecycle.measuredCycles !== 20 ||
      lifecycle.samples.length !== 20 ||
      lifecycle.samples.some(
        (sample) =>
          sample.timelineChildrenAfter !== 0 ||
          sample.activeTweensBeforeUnmount <= 0 ||
          JSON.stringify(sample.after) !== JSON.stringify(lifecycle.baseline),
      )
    )
      throw new Error("RENDERER_LIFECYCLE_GATE_FAILED");
  }
  const interaction = read("interactions");
  if (
    interaction.status !== "COLLECTED" ||
    interaction.samples.length !== 4 ||
    interaction.animation.longTasks.length >= 2 ||
    !Number.isSafeInteger(interaction.animation.intermediateSlideFrames) ||
    interaction.animation.intermediateSlideFrames <= 0 ||
    interaction.samples.some(
      (sample) =>
        sample.visibility !== "visible" ||
        !sample.nextPaintProxy.length ||
        sample.nextPaintProxy.some(
          (paint) => paint.delay > 200 || !Number.isFinite(paint.delay),
        ) ||
        sample.eventTiming.some((event) => event.duration > 200),
    )
  )
    throw new Error("INTERACTION_GATE_FAILED");
  const resources = read("resources");
  if (
    resources.status !== "PASS" ||
    resources.plainGsapChunks.length ||
    !resources.cinematicInitialSceneAssets.includes("mail-bg-01") ||
    resources.cinematicInitialSceneAssets.some(
      (id) => !["mail-bg-01", "mail-bg-02"].includes(id),
    )
  )
    throw new Error("INITIAL_RESOURCE_GATE_FAILED");
  const manifest = JSON.parse(
    fs.readFileSync("content/generated/assets.json", "utf8"),
  );
  for (const id of ["mail-bg-01", "tide-bg-01"]) {
    const variants =
      manifest.assets
        .find((asset) => asset.id === id)
        ?.variants.filter((variant) => variant.width === 960) ?? [];
    if (variants.length !== 2) throw new Error("FIRST_IMAGE_VARIANT_MISSING");
    for (const variant of variants) {
      const path = "apps/web/public" + variant.path;
      if (
        !/^\/assets\/[a-z0-9._-]+$/.test(variant.path) ||
        variant.path.includes("..") ||
        fs.statSync(path).size !== variant.bytes ||
        sha(path) !== variant.sha256 ||
        variant.bytes > 180 * 1024
      )
        throw new Error("FIRST_IMAGE_BUDGET_FAILED");
      result.firstImages960.push({
        id,
        path,
        bytes: variant.bytes,
        sha256: variant.sha256,
      });
    }
  }
} catch (error) {
  result.errors.push(
    /^[A-Z_]+$/.test(error.message)
      ? error.message
      : "PERFORMANCE_EVIDENCE_INVALID",
  );
}
if (result.commands.some((command) => command.exitCode !== 0))
  result.errors.push("PERFORMANCE_COMMAND_FAILED");
result.status = result.errors.length ? "FAILED" : "PERFORMANCE_GATES_PASSED";
result.finishedAt = new Date().toISOString();
write();
console.log(
  JSON.stringify({ status: result.status, report: file, releaseReady: false }),
);
if (result.errors.length) process.exitCode = 1;
