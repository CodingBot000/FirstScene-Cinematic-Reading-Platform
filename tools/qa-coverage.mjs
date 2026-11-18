import fs from "node:fs";
import { createHash } from "node:crypto";
import YAML from "yaml";
const hash = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const latest = JSON.parse(fs.readFileSync("evidence/qa/full-run/latest.json"));
if (hash(latest.path) !== latest.sha256)
  throw new Error("FULL_REPORT_HASH_MISMATCH");
const full = JSON.parse(fs.readFileSync(latest.path));
const cases = YAML.parse(
  fs.readFileSync("contracts/qa-cases.yaml", "utf8"),
).cases;
const mapping = JSON.parse(fs.readFileSync("contracts/qa-coverage-map.json"));
if (cases.length !== 57 || Object.keys(mapping).length !== 57)
  throw new Error("QA_MAPPING_INCOMPLETE");
const result = {
  observedAt: new Date().toISOString(),
  status: "COVERAGE_RECONCILED_NOT_PRODUCT_READINESS",
  sourceCommit: full.commit,
  fullReport: latest,
  releaseReady: false,
  humanReviews: 0,
  cases: [],
  counts: {},
};
for (const item of cases) {
  const map = mapping[item.id];
  if (!map) throw new Error("QA_CASE_UNMAPPED");
  const row = {
    id: item.id,
    group: item.group,
    status: map.status,
    note:
      map.note ??
      "Scoped actual automated or agent evidence; not a claim of complete product readiness.",
    artifacts: [],
  };
  for (const id of map.suites ?? []) {
    const suite = full.suites.find((suite) => suite.id === id);
    if (!suite || !suite.executed || !suite.reportVerified)
      row.status = "NOT_VERIFIED";
    else if (suite.exitCode !== 0 && row.status !== "PARTIAL")
      row.status = "FAILED";
    for (const artifact of suite?.artifacts ?? []) {
      if (hash(artifact.path) !== artifact.sha256)
        throw new Error("QA_EVIDENCE_HASH_MISMATCH");
      row.artifacts.push(artifact);
    }
  }
  for (const path of map.artifacts ?? [])
    row.artifacts.push({ path, sha256: hash(path) });
  if (!row.artifacts.length) throw new Error("QA_EVIDENCE_MISSING");
  result.cases.push(row);
  result.counts[row.status] = (result.counts[row.status] ?? 0) + 1;
}
result.inputs = [
  "contracts/qa-cases.yaml",
  "contracts/qa-coverage-map.json",
].map((path) => ({ path, sha256: hash(path) }));
fs.writeFileSync(
  "evidence/qa/case-coverage.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    status: result.status,
    cases: result.cases.length,
    counts: result.counts,
    releaseReady: false,
    report: "evidence/qa/case-coverage.json",
  }),
);
