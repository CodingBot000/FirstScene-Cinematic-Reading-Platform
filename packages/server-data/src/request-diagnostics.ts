import { AsyncLocalStorage } from "node:async_hooks";

type TransactionOutcome = "committed" | "replayed" | "rolled-back" | "failed";
type RequestDiagnostics = {
  transaction: { outcome: TransactionOutcome; durationMs: number } | null;
};

export const requestDiagnostics = new AsyncLocalStorage<RequestDiagnostics>();

export function recordTransaction(start: number, outcome: TransactionOutcome) {
  const request = requestDiagnostics.getStore();
  if (request)
    request.transaction = {
      outcome,
      durationMs: Math.round(performance.now() - start),
    };
}
