import fs from "node:fs";
import { buildReleaseReceipts } from "./release-evidence.mjs";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const directory = "evidence/deploy";
const input = args[1] ?? directory + "/release-target.json";
const output = directory + "/preflight.json";
const observedAt = new Date().toISOString();
let report;
let deployment;
try {
  if (args.length && (args.length !== 2 || args[0] !== "--evidence"))
    throw new Error("RELEASE_EVIDENCE_ARGUMENTS_INVALID");
  if (!fs.existsSync(input))
    throw new Error("RELEASE_TARGET_EVIDENCE_REQUIRED");
  const evidence = JSON.parse(fs.readFileSync(input, "utf8"));
  const receipts = buildReleaseReceipts(evidence, observedAt);
  report = receipts.preflight;
  deployment = receipts.deployment;
} catch (error) {
  report = {
    observedAt,
    status: "BLOCKED_EXTERNAL",
    approvedReleaseTarget: false,
    smokeWritesApproved: false,
    reason: /^[A-Z_]+$/.test(error.message)
      ? error.message
      : "RELEASE_TARGET_EVIDENCE_INVALID",
    mutationPerformed: false,
    secretsPrinted: false,
  };
  process.exitCode = 2;
}

fs.mkdirSync(directory, { recursive: true });
if (deployment)
  fs.writeFileSync(
    directory + "/deployment.json",
    JSON.stringify(deployment, null, 2) + "\n",
  );
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
