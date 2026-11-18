import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const lock = JSON.parse(fs.readFileSync("execution/browser-runtime-lock.json"));
const context = path.resolve("artifacts/private/browser-image-context");
fs.mkdirSync(context, { recursive: true, mode: 0o700 });
const exitCode = await new Promise((resolve) => {
  const child = spawn(
    "docker",
    [
      "build",
      "--progress=plain",
      "--file",
      path.resolve("Dockerfile.qa"),
      "--tag",
      lock.qaImageTag,
      context,
    ],
    { stdio: "inherit" },
  );
  child.on("error", () => resolve(1));
  child.on("exit", (code) => resolve(code ?? 1));
});
if (exitCode) process.exitCode = exitCode;
else {
  const imageId = execFileSync(
    "docker",
    ["image", "inspect", lock.qaImageTag, "--format", "{{.Id}}"],
    { encoding: "utf8" },
  ).trim();
  const nodeVersion = execFileSync(
    "docker",
    ["run", "--rm", imageId, "node", "--version"],
    { encoding: "utf8" },
  ).trim();
  if (!/^v24\./.test(nodeVersion)) throw new Error("QA_NODE24_REQUIRED");
  const sha = (p) =>
    createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  const report = {
    observedAt: new Date().toISOString(),
    status: "QA_IMAGE_BUILT",
    imageId,
    nodeVersion,
    playwrightVersion: lock.playwrightVersion,
    dockerfileSha256: sha("Dockerfile.qa"),
    lockSha256: sha("execution/browser-runtime-lock.json"),
    applicationSourceCopied: false,
    hostNodeChanged: false,
  };
  fs.mkdirSync("evidence/ci", { recursive: true });
  fs.writeFileSync(
    "evidence/ci/browser-runtime-image.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}
