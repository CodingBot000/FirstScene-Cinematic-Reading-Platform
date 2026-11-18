import fs from "node:fs";
import {
  assertDeclaredReadiness,
  assertFirstSceneGateBoundaries,
} from "./execution-readiness.mjs";
import { execFileSync } from "node:child_process";
const state = JSON.parse(fs.readFileSync("execution/tasks.json", "utf8"));
assertDeclaredReadiness(state);
const tasks = new Map(state.tasks.map((task) => [task.id, task]));
// The review export records historical commits verified in the source repository.
const snapshotFile = "execution/review-snapshot.json";
const snapshot = fs.existsSync(snapshotFile)
  ? JSON.parse(fs.readFileSync(snapshotFile, "utf8"))
  : null;
const exportedCommits = new Map(
  (snapshot?.completedTasks ?? []).map(({ id, sourceCommit }) => [
    id,
    sourceCommit,
  ]),
);
let exportedTasks = 0;
const visiting = new Set(),
  seen = new Set();
function check(id) {
  if (visiting.has(id)) throw new Error("Cyclic task dependency: " + id);
  if (seen.has(id)) return;
  const task = tasks.get(id);
  if (!task) throw new Error("Missing task: " + id);
  visiting.add(id);
  for (const dep of task.dependencies) check(dep);
  visiting.delete(id);
  seen.add(id);
  if (task.status === "DONE") {
    if (task.dependencies.some((dep) => tasks.get(dep).status !== "DONE"))
      throw new Error("Incomplete dependency: " + id);
    if (!task.commit || !task.evidence.length)
      throw new Error("Missing completion evidence: " + id);
    if (
      snapshot?.schemaVersion === 1 &&
      snapshot?.status === "SOURCE_COMMITS_VERIFIED_BEFORE_EXPORT" &&
      /^[a-f0-9]{40}$/.test(task.commit) &&
      exportedCommits.get(id) === task.commit
    ) {
      exportedTasks++;
    } else {
      execFileSync("git", ["cat-file", "-e", task.commit + "^{commit}"]);
    }
    for (const file of task.evidence)
      if (!fs.existsSync(file))
        throw new Error("Missing evidence file: " + file);
  }
}
for (const id of tasks.keys()) check(id);
assertFirstSceneGateBoundaries(tasks);
const done = state.tasks.filter((task) => task.status === "DONE").length;
if (!fs.readFileSync("PROGRESS.md", "utf8").includes(`${done} / ${tasks.size}`))
  throw new Error("Progress summary mismatch");
console.log(
  `Execution DAG and evidence references passed: ${done}/${tasks.size}. Product readiness not implied.`,
);
if (exportedTasks)
  console.log(
    `Historical commits for ${exportedTasks} tasks were verified in the source repository before export.`,
  );
