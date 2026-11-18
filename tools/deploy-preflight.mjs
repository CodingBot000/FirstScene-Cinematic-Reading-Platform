import fs from "node:fs";
import { execFileSync } from "node:child_process";
const configuredPaths = [
  ".vercel/project.json",
  "apps/web/.vercel/project.json",
];
const targets = configuredPaths.filter((file) => fs.existsSync(file));
const remotes = execFileSync("git", ["remote"], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);
const receiptFile = "evidence/deploy/provider-access.json";
const receipt = fs.existsSync(receiptFile)
  ? JSON.parse(fs.readFileSync(receiptFile, "utf8"))
  : null;
// A linked project is metadata, not release authorization or proof of database/billing availability.
const report = {
  observedAt: new Date().toISOString(),
  status: "BLOCKED_EXTERNAL",
  configuredTargetFiles: targets,
  gitRemoteCount: remotes.length,
  providerAccess: receipt?.status ?? "UNVERIFIED",
  providerReceipt: receiptFile,
  approvedReleaseTarget: false,
  costTier: "unknown",
  externalDatabase: "unverified",
  publicUrl: null,
  reason:
    receipt?.httpStatus === 403
      ? "Connected provider scope returned403; target/billing/database cannot be verified."
      : "No verified authorized deployment target/database/billing evidence.",
  mutationPerformed: false,
  secretsPrinted: false,
};
fs.mkdirSync("evidence/deploy", { recursive: true });
fs.writeFileSync(
  "evidence/deploy/preflight.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
process.exitCode = 2;
