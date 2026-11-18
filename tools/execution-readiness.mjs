// Ledger readiness is separate from suite collection and from the final gate currently verifying itself.
export function assertFirstSceneGateBoundaries(tasks) {
  const audit = "P06-T04";
  const provider = "P09-T01";
  function reaches(task, targets, seen = new Set()) {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return task.dependencies.some((id) => {
      const predecessor = tasks.get(id);
      return (
        targets.has(id) || (predecessor && reaches(predecessor, targets, seen))
      );
    });
  }
  const external = new Set([audit, provider]);
  for (const task of tasks.values()) {
    if (/^P0[78]-/.test(task.id) && reaches(task, external))
      throw new Error("PRODUCT_QA_DEPENDS_ON_EXTERNAL_GATE: " + task.id);
  }
  const deployment = tasks.get("P09-T02");
  if (
    !deployment ||
    [audit, provider, "P08-T02"].some(
      (id) => !deployment.dependencies.includes(id),
    ) ||
    !deployment.commandIds.includes("CMD-RELEASE") ||
    tasks.get(audit)?.gate !== "local"
  )
    throw new Error("RELEASE_GATE_DEPENDENCY_MISSING");
}

export function assertDeclaredReadiness(state) {
  const ids = new Set(state.tasks.map((task) => task.id));
  if (ids.size !== state.tasks.length) throw new Error("DUPLICATE_TASK_ID");
  const local = state.tasks.filter((task) => task.gate === "local");
  const publicTasks = state.tasks.filter((task) => task.gate === "public");
  if (
    ["LOCAL_PRODUCT_READY", "PUBLIC_RELEASE_READY"].includes(state.status) &&
    (!local.length || local.some((task) => task.status !== "DONE"))
  )
    throw new Error("LOCAL_READINESS_REQUIRES_ALL_LOCAL_DONE");
  if (
    state.status === "PUBLIC_RELEASE_READY" &&
    (!publicTasks.length || publicTasks.some((task) => task.status !== "DONE"))
  )
    throw new Error("PUBLIC_READINESS_REQUIRES_ALL_PUBLIC_DONE");
  return {
    localDone: local.filter((task) => task.status === "DONE").length,
    localTotal: local.length,
    publicDone: publicTasks.filter((task) => task.status === "DONE").length,
    publicTotal: publicTasks.length,
  };
}
