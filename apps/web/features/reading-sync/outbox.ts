import type {
  PreferencesWrite,
  ProgressWrite,
  BookmarkWrite,
  Mutation,
  Me,
} from "./transport.generated";
import { isTransport } from "./validate";
export const SYNC_KEY = "firstscene:sync:v1";
export const RESET_KEY = "firstscene:reset:v1";
export const PREFERENCES_INTENT_KEY = "firstscene:preference-intent:v1";
export const PREFERENCES_BINDING_KEY = "firstscene:preference-binding:v1";
export type ResetPhase = "none" | "active" | "deleting" | "failed" | "deleted";
export type ResetRecord = {
  schemaVersion: 1;
  id: string;
  phase: Exclude<ResetPhase, "none">;
};
export function decodeReset(raw: string | null): {
  id: string;
  phase: ResetPhase;
} {
  if (raw === null) return { id: "", phase: "none" };
  const uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (uuid.test(raw)) return { id: raw, phase: "failed" }; // Legacy marker cannot prove erasure.
  try {
    if (raw.length > 256) throw new Error("RESET_LIMIT");
    const value = JSON.parse(raw) as ResetRecord;
    if (
      value.schemaVersion !== 1 ||
      !uuid.test(value.id) ||
      !["active", "deleting", "failed", "deleted"].includes(value.phase) ||
      Object.keys(value).some(
        (key) => !["schemaVersion", "id", "phase"].includes(key),
      )
    )
      throw new Error("RESET_SCHEMA");
    return { id: value.id, phase: value.phase };
  } catch {
    return { id: "invalid-reset", phase: "failed" };
  }
}
export type Pending = {
  key: string;
  method: "PUT" | "DELETE";
  path: string;
  body: PreferencesWrite | ProgressWrite | BookmarkWrite | Mutation;
  changedAt: number;
  conflicts: number;
  sent?: boolean;
  ownerId?: string;
  intentId?: string;
};
export type Durable = {
  schemaVersion: 1;
  reset: string;
  epoch: string | null;
  expiresAt: string;
  me: Me | null;
  queue: Pending[];
  settled: Record<string, number>;
};
const id = "[a-z][a-z0-9-]{1,63}";
export function validPending(item: Pending) {
  if (
    !item ||
    typeof item !== "object" ||
    !Number.isFinite(item.changedAt) ||
    ![0, 1].includes(item.conflicts) ||
    (item.sent !== undefined && typeof item.sent !== "boolean") ||
    (item.ownerId !== undefined && !/^[a-f0-9-]{36}$/i.test(item.ownerId)) ||
    (item.intentId !== undefined && !/^[a-f0-9-]{36}$/i.test(item.intentId))
  )
    return false;
  if (item.key === "preferences")
    return (
      item.method === "PUT" &&
      item.path === "/api/v1/preferences" &&
      isTransport("PreferencesWrite", item.body)
    );
  if (new RegExp(`^progress:${id}$`).test(item.key))
    return (
      item.method === "PUT" &&
      item.path === "/api/v1/progress/" + item.key.slice(9) &&
      isTransport("ProgressWrite", item.body)
    );
  if (new RegExp(`^bookmark:${id}:(?:__story__|${id})$`).test(item.key))
    return (
      item.path ===
        "/api/v1/bookmarks/" + item.key.slice(9).replace(":", "/") &&
      (item.method === "PUT"
        ? isTransport("BookmarkWrite", item.body)
        : item.method === "DELETE" && isTransport("Mutation", item.body))
    );
  return false;
}
export function bounded(queue: Pending[]) {
  return (
    queue.length <= 67 &&
    queue.filter((i) => i.key.startsWith("progress:")).length <= 2 &&
    queue.filter((i) => i.key.startsWith("bookmark:")).length <= 64 &&
    new Set(queue.map((i) => i.key)).size === queue.length &&
    queue.every(validPending) &&
    new TextEncoder().encode(JSON.stringify(queue)).length <= 65536
  );
}
export function decodeDurable(
  raw: string | null,
  reset: string,
): Durable | null {
  if (!raw) return null;
  if (new TextEncoder().encode(raw).length > 65536)
    throw new Error("SYNC_LIMIT");
  const value = JSON.parse(raw) as Durable;
  value.settled ??= {};
  if (
    value.schemaVersion !== 1 ||
    value.reset !== reset ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    !Array.isArray(value.queue) ||
    !bounded(value.queue) ||
    !value.settled ||
    typeof value.settled !== "object" ||
    Object.keys(value.settled).length > 128 ||
    Object.values(value.settled).some(
      (v) => typeof v !== "number" || !Number.isFinite(v),
    ) ||
    (value.me !== null && !isTransport("Me", value.me)) ||
    (value.epoch !== null &&
      (typeof value.epoch !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(value.epoch)))
  )
    throw new Error("SYNC_SCHEMA");
  if (Date.parse(value.expiresAt) <= Date.now()) return null;
  if (value.me && value.me.session.epoch !== value.epoch)
    throw new Error("SYNC_EPOCH");
  return value;
}
export function mergePending(previous: Pending, item: Pending): Pending {
  if (previous.intentId && previous.intentId === item.intentId) {
    if (previous.conflicts !== item.conflicts)
      return previous.conflicts > item.conflicts ? previous : item;
  }
  if (previous.body.operationId === item.body.operationId)
    return previous.sent ? previous : item;
  if (
    previous.key.startsWith("progress:") &&
    isTransport("ProgressWrite", previous.body) &&
    isTransport("ProgressWrite", item.body)
  ) {
    // A completion is an explicit milestone. The latest ordinary anchor remains in the existing bounded cache until its acknowledgement.
    if (previous.body.completed && !item.body.completed) return previous;
    if (item.body.completed && !previous.body.completed) return item;
  }
  return previous.changedAt > item.changedAt ? previous : item;
}
export type PreferenceIntent = {
  schemaVersion: 1;
  reset: string;
  epoch: string | null;
  expiresAt: string;
  pending: Pending;
};
// A synchronous, single-slot intent survives navigation before the asynchronous state lock runs.
// Its original request body is immutable; CAS retries remain in the normal bounded outbox.
export function readPreferenceIntent(
  storage: Pick<Storage, "getItem">,
): PreferenceIntent | null {
  const raw = storage.getItem(PREFERENCES_INTENT_KEY);
  if (!raw) return null;
  if (raw.length > 4096) throw new Error("PREFERENCE_INTENT_LIMIT");
  const value = JSON.parse(raw) as PreferenceIntent;
  if (
    value.schemaVersion !== 1 ||
    typeof value.reset !== "string" ||
    (value.epoch !== null && !/^[a-f0-9-]{36}$/i.test(value.epoch)) ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    !validPending(value.pending) ||
    value.pending.key !== "preferences" ||
    !value.pending.intentId ||
    value.pending.conflicts !== 0 ||
    value.pending.sent
  )
    throw new Error("PREFERENCE_INTENT_SCHEMA");
  if (Date.parse(value.expiresAt) <= Date.now()) return null;
  const bindingRaw = storage.getItem(PREFERENCES_BINDING_KEY);
  if (bindingRaw) {
    if (bindingRaw.length > 512) throw new Error("PREFERENCE_BINDING_LIMIT");
    const binding = JSON.parse(bindingRaw);
    if (
      binding.schemaVersion !== 1 ||
      !/^[a-f0-9-]{36}$/i.test(binding.intentId) ||
      !/^[a-f0-9-]{36}$/i.test(binding.epoch)
    )
      throw new Error("PREFERENCE_BINDING_SCHEMA");
    if (!value.epoch && binding.intentId === value.pending.intentId)
      value.epoch = binding.epoch;
  }
  return value;
}
export function intentInScope(
  intent: PreferenceIntent,
  reset: string,
  epoch: string | null,
) {
  return (
    (!intent.epoch || !epoch || intent.epoch === epoch) &&
    (intent.reset === reset || Boolean(epoch && intent.epoch === epoch))
  );
}
export function replacePending(queue: Pending[], item: Pending) {
  const previous = queue.find((old) => old.key === item.key);
  const next = [
    ...queue.filter((old) => old.key !== item.key),
    previous ? mergePending(previous, item) : item,
  ];
  if (!bounded(next)) throw new Error("OUTBOX_LIMIT");
  return next;
}
