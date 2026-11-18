import fs from "node:fs";
import { execFileSync } from "node:child_process";
const [id, status, ...evidence] = process.argv.slice(2);
const file = "execution/tasks.json";
const state = JSON.parse(fs.readFileSync(file, "utf8"));
const task = state.tasks.find((t) => t.id === id);
if (!task) throw new Error("Unknown task");
const now = new Date().toISOString();
const previous = task.status;
if (
  ["IN_PROGRESS", "VERIFYING", "DONE"].includes(status) &&
  task.dependencies.some(
    (id) => state.tasks.find((t) => t.id === id).status !== "DONE",
  )
)
  throw new Error("Incomplete prerequisite");
if (status === "IN_PROGRESS") {
  task.startedAt ??= now;
  task.attempts++;
  task.branch = execFileSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
  }).trim();
  task.actorType = "agent";
}
if (status === "DONE") {
  if (previous !== "VERIFYING")
    throw new Error("Must verify before completion");
  for (const path of evidence)
    if (!fs.existsSync(path)) throw new Error("Missing evidence " + path);
  if (!evidence.length) throw new Error("Evidence required");
  task.evidence = evidence;
  task.commit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
}
task.status = status;
task.updatedAt = now;
state.status = "IN_PROGRESS";
fs.writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
const done = state.tasks.filter((t) => t.status === "DONE");
const active = state.tasks.filter((t) =>
  ["IN_PROGRESS", "VERIFYING", "FAILED_REPAIR"].includes(t.status),
);
const pending = state.tasks.filter(
  (t) =>
    t.status === "PENDING" &&
    t.dependencies.every(
      (d) => state.tasks.find((t) => t.id === d).status === "DONE",
    ),
);
fs.writeFileSync(
  "PROGRESS.md",
  `# PROGRESS\n\n- 제품 상태: **${state.status}**\n- 제품 작업 완료: **${done.length} / ${state.tasks.length}**\n- local gate: ${done.filter((t) => t.gate === "local").length} / 30; public gate: ${done.filter((t) => t.gate === "public").length} / 3\n- 현재: ${active.map((t) => t.id + " " + t.title).join(", ") || "없음"}\n- 다음 실행 가능: ${pending.map((t) => t.id).join(", ")}\n- 실제 제품 QA·생성 이미지·DB·배포의 완료는 각 작업 증거로만 확인한다.\n\n| Task | 상태 |\n|---|---|\n${state.tasks.map((t) => `| ${t.id} ${t.title} | ${t.status} |`).join("\n")}\n`,
);
fs.appendFileSync(
  "WORK_LOG.md",
  `\n## ${now} — ${id}\n- ${previous} → ${status}. ${task.commit ? "Code commit: " + task.commit + ". " : ""}Evidence: ${evidence.join(", ") || "in progress"}.\n`,
);
console.log(`${id}: ${previous} -> ${status}`);
