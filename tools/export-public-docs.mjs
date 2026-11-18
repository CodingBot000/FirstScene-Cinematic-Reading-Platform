import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const files = [
  "README.md",
  "RELEASE_REPORT.md",
  "docs/public/runbook.md",
  "docs/public/case-study.md",
  "docs/public/architecture.md",
];
const directory = "artifacts/public-documents";
fs.mkdirSync(directory, { recursive: true });
const artifacts = [];
for (const source of files) {
  const content = Buffer.from(
    fs
      .readFileSync(source, "utf8")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, target) => {
        if (/^(?:https?:|#)/.test(target)) return match;
        const resolved = path.posix.normalize(
          path.posix.join(path.posix.dirname(source), target),
        );
        return files.includes(resolved)
          ? match
          : label + " (project evidence: " + target + ")";
      }),
  );
  const target = directory + "/" + source;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  artifacts.push({
    path: target,
    source,
    sha256: createHash("sha256").update(content).digest("hex"),
  });
}
const report = {
  observedAt: new Date().toISOString(),
  status: "SELECTED_DOCUMENTS_EXPORTED",
  publication: false,
  includesGitHistory: false,
  includesPrivateBriefing: false,
  includesCredentials: false,
  artifacts,
  note: "Local selected document copies; original internal planning inputs remain private.",
};
fs.writeFileSync(
  directory + "/index.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    status: report.status,
    report: directory + "/index.json",
    publication: false,
  }),
);
