// Ledger readiness is separate from suite collection and from the final gate currently verifying itself.
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
