import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
// The ledger gate runs in Node, outside the product's runtime packages.
// @ts-expect-error JavaScript orchestration module deliberately has no public package declaration.
import { assertDeclaredReadiness } from "../../tools/execution-readiness.mjs";
const actual = JSON.parse(readFileSync("execution/tasks.json", "utf8"));
it("refuses local readiness when a required decision/task is pending and preserves the denominator", () => {
  const state = structuredClone(actual);
  state.status = "LOCAL_PRODUCT_READY";
  state.tasks.find((task: { id: string }) => task.id === "P04-T04").status =
    "PENDING";
  expect(() => assertDeclaredReadiness(state)).toThrow(/ALL_LOCAL_DONE/);
  expect(assertDeclaredReadiness(actual).localTotal).toBe(30);
});
it("refuses public readiness despite all local tasks completing while provider access is blocked", () => {
  const state = structuredClone(actual);
  for (const task of state.tasks)
    if (task.gate === "local") task.status = "DONE";
  state.status = "PUBLIC_RELEASE_READY";
  state.tasks.find((task: { id: string }) => task.id === "P09-T01").status =
    "BLOCKED_EXTERNAL";
  expect(() => assertDeclaredReadiness(state)).toThrow(/ALL_PUBLIC_DONE/);
  state.status = "LOCAL_PRODUCT_READY";
  expect(assertDeclaredReadiness(state).publicTotal).toBe(3);
});
it("refuses duplicate task IDs which could conceal an incomplete task", () => {
  const state = structuredClone(actual);
  state.tasks.push(state.tasks[0]);
  expect(() => assertDeclaredReadiness(state)).toThrow(/DUPLICATE/);
});
