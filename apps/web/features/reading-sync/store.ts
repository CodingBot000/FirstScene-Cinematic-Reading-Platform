import type { ReaderPrefs, ReadingAnchor } from "@firstscene/story-schema";
import type {
  Me,
  Progress,
  Bookmark,
  FeedbackWrite,
} from "./transport.generated";
import { isTransport } from "./validate";
import { prefsFromDto, anchorFromDto, desiredBookmarks } from "./selectors";
import {
  SYNC_KEY,
  RESET_KEY,
  decodeDurable,
  replacePending,
  decodeReset,
  PREFERENCES_INTENT_KEY,
  PREFERENCES_BINDING_KEY,
  readPreferenceIntent,
  intentInScope,
} from "./outbox";
import type { Durable, Pending, ResetRecord, ResetPhase } from "./outbox";
import {
  LOCAL_CACHE_KEY,
  decodeCache,
  validAnchor,
  validPreferences,
} from "../reader-preferences/local-store";
import type { StoragePort } from "../reader-preferences/local-store";
export type SyncSnapshot = {
  paused: boolean;
  canRetry: boolean;
  initialProgress: readonly Progress[] | null;
  hydrated: boolean;
  ready: boolean;
  status:
    | "loading"
    | "local"
    | "saving"
    | "saved"
    | "offline"
    | "error"
    | "expired"
    | "deleting"
    | "delete-error"
    | "deleted";
  me: Me | null;
  queue: readonly Pending[];
  notice: string | null;
  storageError: boolean;
};
export const syncServerSnapshot: SyncSnapshot = {
  paused: false,
  canRetry: false,
  initialProgress: null,
  hydrated: false,
  ready: false,
  status: "loading",
  me: null,
  queue: [],
  notice: null,
  storageError: false,
};
export type FeedbackSendResult =
  | { status: "accepted" }
  | { status: "retryable" | "rejected"; message: string; retryAt?: number };
export type SyncPorts = {
  allowCreation?: () => boolean;
  storage: () => StoragePort;
  fetch: typeof fetch;
  online: () => boolean;
  foreground: () => boolean;
  uuid: () => string;
  now: () => number;
  random: () => number;
  lock: <T>(action: () => Promise<T>) => Promise<T>;
  stateLock?: <T>(action: () => Promise<T>) => Promise<T>;
  changed: () => void;
};
export { prefsFromDto, anchorFromDto, desiredBookmarks } from "./selectors";
class TransportFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    public details: {
      currentRevision?: number;
      currentProgress?: Progress;
    } = {},
    public retryAfter = 0,
  ) {
    super(code);
  }
}
export function createSyncStore(port: SyncPorts) {
  let state = syncServerSnapshot;
  let data: Durable = {
    schemaVersion: 1,
    reset: "",
    epoch: null,
    expiresAt: new Date(port.now() + 30 * 86400000).toISOString(),
    me: null,
    queue: [],
    settled: {},
  };
  let initialized = false,
    running = false,
    stopped = false,
    blocked = false,
    generation = 0,
    retries = 0;
  let flushing: Promise<void> | null = null,
    booting: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let progressFirstAt = 0;
  let retryAt = 0;
  const latestAnchors = new Map<
    string,
    { anchor: ReadingAnchor; ownerId?: string }
  >();
  let resetPhase: ResetPhase = "none";
  let erasing: Promise<boolean> | null = null;
  let resuming: Promise<boolean> | null = null;
  const listeners = new Set<() => void>();
  function publish(patch: Partial<SyncSnapshot> = {}) {
    state = {
      ...state,
      ready: true,
      me: data.me,
      queue: [...data.queue],
      ...patch,
    };
    state.canRetry = !blocked && state.status === "error";
    state.paused = stopped;
    for (const listener of listeners) listener();
  }
  function resetRecord() {
    try {
      return decodeReset(port.storage().getItem(RESET_KEY));
    } catch {
      return { id: data.reset, phase: resetPhase };
    }
  }
  function currentReset() {
    return resetRecord().id;
  }
  function writeReset(record: ResetRecord) {
    try {
      port.storage().setItem(RESET_KEY, JSON.stringify(record));
      data.reset = record.id;
      resetPhase = record.phase;
      return true;
    } catch {
      publish({ storageError: true });
      return false;
    }
  }
  function initialize() {
    if (initialized) return;
    initialized = true;
    const reset = resetRecord();
    data.reset = reset.id;
    resetPhase = reset.phase;
    try {
      const existing = decodeDurable(
        port.storage().getItem(SYNC_KEY),
        data.reset,
      );
      if (existing) data = existing;
    } catch {
      publish({
        storageError: true,
        notice: "임시 동기화 기록을 읽지 못했어요. 본문은 계속 읽을 수 있어요.",
      });
    }
    if (!data.epoch) {
      try {
        const local = decodeCache(
          port.storage().getItem(LOCAL_CACHE_KEY),
        ).cache;
        if (local.sessionEpoch)
          data = {
            ...data,
            epoch: local.sessionEpoch,
            expiresAt: local.expiresAt,
          };
      } catch {
        /* A damaged sync record must not erase a known cache epoch. */
      }
    }
    recoverPreference();
    publish({ status: port.online() ? "local" : "offline" });
    if (["deleting", "failed"].includes(reset.phase)) {
      stopped = true;
      blocked = true;
      publish({
        status: "delete-error",
        hydrated: true,
        notice:
          "이전 삭제 요청의 완료를 확인하지 못했어요. 기록은 유지하고 자동 저장을 멈췄어요. 삭제를 다시 시도해 주세요.",
      });
    } else if (reset.phase === "deleted") {
      stopped = true;
      blocked = true;
      data = { ...data, epoch: null, me: null, queue: [], settled: {} };
      publish({
        status: "deleted",
        hydrated: true,
        notice: "이 브라우저의 독서 기록을 삭제했어요.",
      });
    }
  }
  function recoverPreference() {
    try {
      const intent = readPreferenceIntent(port.storage());
      if (!intent || !intentInScope(intent, data.reset, data.epoch)) return;
      if (!data.epoch && intent.epoch)
        data = { ...data, epoch: intent.epoch, expiresAt: intent.expiresAt };
      if (intent.pending.changedAt <= (data.settled.preferences ?? -1)) return;
      // A retry of this intent outranks its immutable initial descriptor.
      data.queue = replacePending(data.queue, intent.pending);
    } catch {
      publish({ storageError: true });
    }
  }
  function persist(acknowledged?: Pending, rollover?: ResetRecord) {
    const version = generation,
      reset = data.reset;
    const write = async () => {
      try {
        if (version !== generation || currentReset() !== reset) return false;
        const shared = decodeDurable(port.storage().getItem(SYNC_KEY), reset);
        if (
          shared &&
          shared.epoch &&
          data.epoch &&
          shared.epoch !== data.epoch
        ) {
          blocked = true;
          publish({
            status: "expired",
            notice: "다른 세션의 임시 요청을 합치지 않았어요.",
          });
          return false;
        }
        if (shared?.epoch && !data.epoch)
          data = { ...data, epoch: shared.epoch, expiresAt: shared.expiresAt };
        const settled = { ...shared?.settled, ...data.settled };
        for (const [key, timestamp] of Object.entries(shared?.settled ?? {}))
          settled[key] = Math.max(settled[key] ?? 0, timestamp);
        if (acknowledged)
          settled[acknowledged.key] = Math.max(
            settled[acknowledged.key] ?? 0,
            acknowledged.changedAt,
          );
        const cache = readAnchorCache();
        let queue: Pending[] = [];
        for (const item of [...(shared?.queue ?? []), ...data.queue]) {
          if (item.changedAt <= (settled[item.key] ?? -1)) continue;
          if (
            item.key.startsWith("progress:") &&
            isTransport("ProgressWrite", item.body) &&
            !item.body.completed &&
            item.ownerId &&
            cache?.anchorOwners[item.key.slice(9)] &&
            cache.anchorOwners[item.key.slice(9)] !== item.ownerId
          )
            continue;
          queue = replacePending(queue, item);
        }
        if (Object.keys(settled).length > 128) throw new Error("SYNC_LIMIT");
        data = { ...data, queue, settled };
        recoverPreference();
        const raw = JSON.stringify(
          rollover ? { ...data, reset: rollover.id } : data,
        );
        if (new TextEncoder().encode(raw).length > 65536)
          throw new Error("SYNC_LIMIT");
        if (rollover && !writeReset(rollover))
          throw new Error("RESET_WRITE_FAILED");
        port.storage().setItem(SYNC_KEY, raw);
        return true;
      } catch {
        publish({
          storageError: true,
          notice:
            "이 기기에 임시 저장할 수 없어요. 서버 저장 결과를 확인해 주세요.",
        });
        return false;
      }
    };
    return port.stateLock ? port.stateLock(write) : write();
  }
  function cacheWrite(
    action: (cache: ReturnType<typeof decodeCache>["cache"]) => void,
  ) {
    try {
      const cache = decodeCache(port.storage().getItem(LOCAL_CACHE_KEY)).cache;
      action(cache);
      port.storage().setItem(LOCAL_CACHE_KEY, JSON.stringify(cache));
    } catch {
      publish({ storageError: true });
    }
  }
  function readAnchorCache() {
    try {
      const cache = decodeCache(port.storage().getItem(LOCAL_CACHE_KEY)).cache;
      return data.epoch &&
        cache.sessionEpoch &&
        data.epoch !== cache.sessionEpoch
        ? null
        : cache;
    } catch {
      return null;
    }
  }
  function resetChanged() {
    const record = resetRecord();
    if (record.id === data.reset && record.phase === resetPhase) return false;
    generation++;
    blocked = true;
    stopped = true;
    clearTimeout(timer);
    data = { ...data, reset: record.id };
    resetPhase = record.phase;
    if (record.phase === "deleted") {
      data = { ...data, epoch: null, me: null, queue: [], settled: {} };
      publish({
        status: "deleted",
        notice:
          "다른 탭에서 독서 기록을 삭제했어요. 새로 읽으면 새 기록이 시작돼요.",
      });
    } else if (["deleting", "failed"].includes(record.phase)) {
      try {
        const shared = decodeDurable(
          port.storage().getItem(SYNC_KEY),
          record.id,
        );
        if (shared && (!data.epoch || shared.epoch === data.epoch))
          data = {
            ...data,
            me: data.me ?? shared.me,
            queue: shared.queue,
            settled: shared.settled,
          };
      } catch {
        /* Keep live records when storage cannot be read. */
      }
      publish(
        record.phase === "deleting"
          ? {
              status: "deleting",
              notice:
                "다른 탭에서 삭제 요청을 진행하고 있어요. 완료 전까지 기록을 유지하고 저장을 멈춰요.",
            }
          : {
              status: "delete-error",
              notice:
                "독서 기록을 모두 삭제하지 못했어요. 이 기기의 임시 기록과 요청을 유지하고 저장을 멈췄어요. 설정에서 삭제를 다시 시도해 주세요.",
            },
      );
    } else
      publish({
        status: "expired",
        notice:
          "다른 탭에서 저장 기준이 바뀌었어요. 이전 요청은 보내지 않았어요. 새로고침해 현재 기록을 확인해 주세요.",
      });
    return true;
  }
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    keepalive = false,
    expectedStatus?: number,
  ) {
    const response = await port.fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      ...(body === undefined
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
      keepalive,
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok && expectedStatus && response.status !== expectedStatus)
      throw new TransportFailure(503, "INVALID_FEEDBACK_RESPONSE");
    if (response.status === 204) return null;
    if (method === "DELETE" && response.ok)
      throw new TransportFailure(503, "INVALID_DELETE_RESPONSE");
    const value: unknown = await response.json();
    if (!response.ok) {
      if (isTransport("Error", value))
        throw new TransportFailure(
          response.status,
          value.error.code,
          value.error.details,
          Math.max(0, Number(response.headers.get("retry-after")) || 0),
        );
      throw new TransportFailure(response.status, "INVALID_RESPONSE");
    }
    return value;
  }
  async function adopt(me: Me) {
    const changed = JSON.stringify(data.me) !== JSON.stringify(me);
    if (data.epoch && data.epoch !== me.session.epoch) {
      blocked = true;
      publish({
        status: "expired",
        notice:
          "세션이 바뀌어 이전 임시 요청은 보내지 않았어요. 설정에서 기록을 정리한 뒤 새로 시작할 수 있어요.",
      });
      return false;
    }
    data = {
      ...data,
      epoch: me.session.epoch,
      expiresAt: me.session.expiresAt,
      me,
    };
    await persist();
    cacheWrite((cache) => {
      cache.sessionEpoch = data.epoch;
      cache.expiresAt = data.expiresAt;
      if (!data.queue.some((i) => i.key === "preferences"))
        cache.preferences = prefsFromDto(me.preferences);
      else {
        const pending = data.queue.find((i) => i.key === "preferences")!;
        if (isTransport("PreferencesWrite", pending.body))
          cache.preferences = {
            mode: pending.body.mode,
            reduceMotion: pending.body.effects === "reduced",
            fontSize: pending.body.fontSize,
            theme: pending.body.theme,
          };
      }
      for (const progress of me.progress)
        if (!cache.anchors[progress.storyId])
          cache.anchors[progress.storyId] = anchorFromDto(progress);
    });
    if (changed) port.changed();
    return true;
  }
  async function hydrate(create: boolean, initial = false) {
    const version = generation;
    let value: unknown;
    try {
      value = await request("/api/v1/me");
    } catch (error) {
      if (!(error instanceof TransportFailure) || error.status !== 401)
        throw error;
      if (data.epoch) {
        blocked = true;
        publish({
          status: "expired",
          notice:
            "저장 기간이 지났거나 기록이 삭제됐어요. 이전 임시 요청은 새 세션에 보내지 않았어요.",
        });
        return false;
      }
      if (!create) {
        if (initial && state.initialProgress === null)
          publish({ initialProgress: [] });
        return false;
      }
      if (port.allowCreation && !port.allowCreation()) {
        blocked = true;
        publish({
          status: "error",
          notice:
            "이 브라우저에서는 안전한 다중 탭 저장을 사용할 수 없어 임시 기록만 유지해요.",
        });
        return false;
      }
      // Preserve settings chosen before the first cookie existed. An existing
      // epoch is handled above and is never silently imported into a new one.
      if (!data.queue.some((item) => item.key === "preferences")) {
        try {
          const raw = port.storage().getItem(LOCAL_CACHE_KEY);
          const cache = decodeCache(raw).cache;
          if (raw && cache.sessionEpoch === null)
            savePreferences(cache.preferences);
        } catch {
          /* Denied local storage does not block the pending server write. */
        }
      }
      const session = await request("/api/v1/session", "POST", {});
      if (!isTransport("Session", session))
        throw new Error("INVALID_SESSION_RESPONSE", { cause: error });
      value = await request("/api/v1/me");
    }
    if (version !== generation || resetChanged()) return false;
    if (!isTransport("Me", value)) throw new Error("INVALID_ME_RESPONSE");
    const accepted = await adopt(value);
    if (accepted && initial && state.initialProgress === null)
      publish({ initialProgress: value.progress });
    return accepted;
  }
  function schedule(delay: number) {
    clearTimeout(timer);
    if (!running || stopped || blocked || !port.online()) return;
    timer = setTimeout(
      () => {
        void flush();
      },
      Math.max(delay, retryAt - port.now()),
    );
  }
  function failure(error: unknown) {
    if (error instanceof TransportFailure && error.status === 401) {
      blocked = true;
      publish({
        status: "expired",
        notice:
          "세션이 만료되어 동기화를 멈췄어요. 임시 요청은 새 세션에 자동 적용하지 않아요.",
      });
      return;
    }
    if (
      error instanceof TransportFailure &&
      error.status < 500 &&
      error.status !== 429
    ) {
      blocked = true;
      publish({
        status: "error",
        notice:
          error.code === "REVISION_CONFLICT"
            ? "다른 탭과 저장이 겹쳤어요. 임시 기록을 유지하고 자동 재시도를 멈췄어요."
            : error.code === "CONTENT_CHANGED"
              ? "이야기가 갱신됐어요. 임시 기록을 유지하고 동기화를 멈췄어요."
              : "기록을 서버에 저장하지 못했어요. 임시 기록은 유지돼요.",
      });
      return;
    }
    const delay = Math.max(
      [1, 2, 4, 8, 16, 30][Math.min(retries++, 5)]! * 1000 +
        port.random() * 250,
      error instanceof TransportFailure ? error.retryAfter * 1000 : 0,
    );
    retryAt = port.now() + delay;
    publish({
      status: port.online() ? "error" : "offline",
      notice: port.online()
        ? "서버 저장을 기다리고 있어요. 임시 기록을 보관하고 다시 시도해요."
        : "오프라인이에요. 연결되면 임시 기록을 다시 저장해요.",
    });
    schedule(delay);
  }
  async function ack(item: Pending, value: unknown) {
    const version = generation;
    const me = data.me!;
    if (item.key === "preferences") {
      if (!isTransport("Preferences", value))
        throw new Error("INVALID_PREFERENCES_RESPONSE");
      data.me = {
        ...me,
        preferences:
          value.revision >= me.preferences.revision ? value : me.preferences,
      };
    } else if (item.key.startsWith("progress:")) {
      if (
        !isTransport("Progress", value) ||
        value.storyId !== item.key.slice(9)
      )
        throw new Error("INVALID_PROGRESS_RESPONSE");
      data.me = {
        ...me,
        progress: [
          ...me.progress.filter((p) => p.storyId !== value.storyId),
          me.progress.find(
            (p) => p.storyId === value.storyId && p.revision > value.revision,
          ) ?? value,
        ],
      };
    } else {
      const [, storyId, targetId] = item.key.split(":");
      if (
        item.method === "PUT" &&
        (!isTransport("Bookmark", value) ||
          value.storyId !== storyId ||
          value.targetId !== targetId)
      )
        throw new Error("INVALID_BOOKMARK_RESPONSE");
      data.me = {
        ...me,
        bookmarks: [
          ...me.bookmarks.filter(
            (b) => b.storyId !== storyId || b.targetId !== targetId,
          ),
          ...(item.method === "PUT" ? [value as Bookmark] : []),
        ],
      };
    }
    // A delayed acknowledgement may update the known revision, never remove a newer intent.
    data.queue = data.queue.filter(
      (i) => i.key !== item.key || i.body.operationId !== item.body.operationId,
    );
    retries = 0;
    retryAt = 0;
    await persist(item);
    if (version !== generation || resetChanged() || stopped) return;
    if (
      item.key.startsWith("progress:") &&
      isTransport("ProgressWrite", item.body) &&
      item.body.completed
    ) {
      const storyId = item.key.slice(9),
        cache = readAnchorCache();
      const latest =
        cache?.anchors[storyId] ?? latestAnchors.get(storyId)?.anchor;
      const owner =
        cache?.anchorOwners[storyId] ?? latestAnchors.get(storyId)?.ownerId;
      if (
        latest &&
        latest.contentHash === item.body.contentHash &&
        (latest.beatId !== item.body.beatId ||
          Math.abs(latest.fraction - item.body.fraction) >= 0.005)
      )
        queueAnchor(latest, false, owner);
    }
    port.changed();
    publish({ status: data.queue.length ? "saving" : "saved", notice: null });
  }
  async function transmit(item: Pending, version: number, keepalive: boolean) {
    const me = data.me!;
    const body = { ...item.body };
    if (
      !item.sent &&
      item.key.startsWith("progress:") &&
      "expectedRevision" in body
    )
      body.expectedRevision =
        me.progress.find((p) => p.storyId === item.key.slice(9))?.revision ?? 0;
    // Freeze the exact payload for uncertain-outcome retries. New CAS payloads use a new id.
    item.body = body;
    item.sent = true;
    await persist();
    if (!data.queue.some((p) => p.body.operationId === item.body.operationId))
      return;
    if (item.key === "preferences" && item.intentId) {
      // Bind a pre-cookie choice before its first possible server mutation.
      // A denied store with no durable descriptor still supports memory-only saving.
      let intent;
      try {
        intent = readPreferenceIntent(port.storage());
      } catch {
        /* No durable storage. */
      }
      if (intent?.pending.intentId === item.intentId && !intent.epoch) {
        port.storage().setItem(
          PREFERENCES_BINDING_KEY,
          JSON.stringify({
            schemaVersion: 1,
            intentId: item.intentId,
            epoch: data.epoch,
          }),
        );
      }
    }
    try {
      const value = await request(item.path, item.method, body, keepalive);
      if (version !== generation || resetChanged()) return;
      await ack(item, value);
      if (version !== generation || stopped) return;
      if (item.key.startsWith("bookmark:")) {
        await hydrate(false);
        if (version === generation && !blocked)
          publish({ status: data.queue.length ? "saving" : "saved" });
      }
    } catch (error) {
      if (version !== generation || resetChanged()) return;
      if (
        error instanceof TransportFailure &&
        error.code === "REVISION_CONFLICT" &&
        data.queue.find((p) => p.key === item.key)?.body.operationId !==
          item.body.operationId
      ) {
        await hydrate(false);
        return;
      }
      if (
        error instanceof TransportFailure &&
        error.code === "BOOKMARK_LIMIT"
      ) {
        data.queue = data.queue.filter(
          (i) => i.body.operationId !== item.body.operationId,
        );
        await persist(item);
        await hydrate(false);
        publish({
          status: "error",
          notice:
            "저장 가능한 64개 항목에 도달해 추가하지 못했어요. 기존 항목을 정리한 뒤 다시 저장해 주세요.",
        });
        return;
      }
      if (
        error instanceof TransportFailure &&
        error.code === "REVISION_CONFLICT" &&
        item.conflicts === 0 &&
        data.queue.find((i) => i.key === item.key)?.body.operationId ===
          item.body.operationId
      ) {
        if (!(await hydrate(false))) return;
        if (
          !port.foreground() &&
          item.key.startsWith("progress:") &&
          !(isTransport("ProgressWrite", item.body) && item.body.completed) &&
          (!item.ownerId ||
            readAnchorCache()?.anchorOwners[item.key.slice(9)] !== item.ownerId)
        ) {
          // The foreground tab's anchor wins; the server already preserves furthest/completed.
          data.queue = data.queue.filter((i) => i.key !== item.key);
          await persist(item);
          publish({ status: data.queue.length ? "saving" : "saved" });
          return;
        }
        const retry = {
          ...item,
          conflicts: 1,
          sent: false,
          body: {
            ...body,
            operationId: port.uuid(),
            ...("expectedRevision" in body
              ? {
                  expectedRevision:
                    item.key === "preferences"
                      ? data.me!.preferences.revision
                      : (data.me!.progress.find(
                          (p) => p.storyId === item.key.slice(9),
                        )?.revision ?? 0),
                }
              : {}),
          },
        };
        data.queue = replacePending(data.queue, retry);
        await persist();
        await transmit(retry, version, keepalive);
        return;
      }
      throw error;
    }
  }
  function flush(keepalive = false): Promise<void> {
    initialize();
    clearTimeout(timer);
    progressFirstAt = 0;
    if (flushing) return flushing;
    if (stopped) return Promise.resolve();
    if (stopped || blocked || !port.online()) {
      if (!port.online()) publish({ status: "offline" });
      return Promise.resolve();
    }
    if (retryAt > port.now()) {
      schedule(retryAt - port.now());
      return Promise.resolve();
    }
    flushing = port
      .lock(async () => {
        if (resetChanged() || stopped || blocked) return;
        const version = generation;
        try {
          await persist();
          if (!data.queue.length) {
            await hydrate(false);
            if (!blocked)
              publish({ status: data.me ? "saved" : "local", notice: null });
            return;
          }
          if (data.queue.length && !data.me && !(await hydrate(true))) return;
          while (
            data.queue.length &&
            version === generation &&
            !stopped &&
            !blocked &&
            port.online()
          ) {
            publish({ status: "saving" });
            await transmit(data.queue[0]!, version, keepalive);
          }
        } catch (error) {
          if (version === generation && !stopped) failure(error);
        }
      })
      .finally(() => {
        flushing = null;
      });
    return flushing;
  }
  function enqueue(item: Pending, progress = false) {
    initialize();
    if (resetChanged() || stopped) return;
    let previousTime = Math.max(
      data.settled[item.key] ?? 0,
      ...data.queue.filter((i) => i.key === item.key).map((i) => i.changedAt),
    );
    try {
      const intent = readPreferenceIntent(port.storage());
      if (
        item.key === "preferences" &&
        intent &&
        intentInScope(intent, data.reset, data.epoch)
      )
        previousTime = Math.max(previousTime, intent.pending.changedAt);
      const shared = decodeDurable(
        port.storage().getItem(SYNC_KEY),
        data.reset,
      );
      previousTime = Math.max(
        previousTime,
        shared?.settled[item.key] ?? 0,
        ...(shared?.queue ?? [])
          .filter((i) => i.key === item.key)
          .map((i) => i.changedAt),
      );
    } catch {
      /* The in-memory queue remains available with denied storage. */
    }
    item.changedAt = Math.max(item.changedAt, previousTime + 1);
    if (item.key === "preferences") {
      item.intentId = item.body.operationId;
      try {
        port.storage().setItem(
          PREFERENCES_INTENT_KEY,
          JSON.stringify({
            schemaVersion: 1,
            reset: data.reset,
            epoch: data.epoch,
            expiresAt: data.expiresAt,
            pending: item,
          }),
        );
      } catch {
        publish({ storageError: true });
      }
    }
    try {
      data.queue = replacePending(data.queue, item);
    } catch {
      publish({
        status: "error",
        notice: "임시 저장 한도에 도달했어요. 기존 저장 문장을 정리해 주세요.",
      });
      return;
    }
    void persist();
    publish({
      status: blocked ? state.status : port.online() ? "local" : "offline",
    });
    const pinned = data.queue.find((p) => p.key === item.key);
    if (
      pinned &&
      isTransport("ProgressWrite", pinned.body) &&
      pinned.body.completed
    )
      schedule(0);
    else if (progress) {
      progressFirstAt ||= port.now();
      schedule(
        Math.min(750, Math.max(0, 5000 - (port.now() - progressFirstAt))),
      );
    } else schedule(0);
  }
  function sameCacheEpoch() {
    initialize();
    try {
      const cached = decodeCache(port.storage().getItem(LOCAL_CACHE_KEY)).cache
        .sessionEpoch;
      if (data.epoch && cached && data.epoch !== cached) {
        blocked = true;
        stopped = true;
        publish({
          status: "expired",
          notice:
            "이 기기에 다른 세션의 임시 기록이 남아 있어 새 세션에 보내지 않았어요. 새로고침해 현재 기록을 확인하거나 설정에서 기록을 정리해 주세요.",
        });
        return false;
      }
    } catch {
      /* Invalid or inaccessible storage cannot supply a prior epoch. */
    }
    return true;
  }
  function savePreferences(p: ReaderPrefs) {
    if (!validPreferences(p)) return;
    if (!sameCacheEpoch()) return;
    enqueue({
      key: "preferences",
      method: "PUT",
      path: "/api/v1/preferences",
      body: {
        operationId: port.uuid(),
        expectedRevision: data.me?.preferences.revision ?? 0,
        mode: p.mode,
        effects: p.reduceMotion ? "reduced" : "full",
        fontSize: p.fontSize,
        theme: p.theme,
      },
      changedAt: port.now(),
      conflicts: 0,
    });
  }
  function saveAnchor(a: ReadingAnchor, ownerId?: string) {
    if (
      !validAnchor(a) ||
      (!port.foreground() &&
        (!ownerId || readAnchorCache()?.anchorOwners[a.storyId] !== ownerId))
    )
      return;
    if (!sameCacheEpoch()) return;
    latestAnchors.set(a.storyId, {
      anchor: a,
      ...(ownerId ? { ownerId } : {}),
    });
    if (latestAnchors.size > 2)
      latestAnchors.delete(latestAnchors.keys().next().value!);
    const old = data.queue.find((i) => i.key === "progress:" + a.storyId);
    if (
      old &&
      "beatId" in old.body &&
      old.body.beatId === a.beatId &&
      Math.abs(old.body.fraction - a.fraction) < 0.005
    )
      return;
    const confirmed = data.me?.progress.find((p) => p.storyId === a.storyId);
    if (
      !old &&
      confirmed?.beatId === a.beatId &&
      confirmed.contentHash === a.contentHash &&
      Math.abs(confirmed.fraction - a.fraction) < 0.005
    )
      return;
    queueAnchor(a, false, ownerId);
  }
  function queueAnchor(a: ReadingAnchor, completed: boolean, ownerId?: string) {
    const confirmed = data.me?.progress.find((p) => p.storyId === a.storyId);
    enqueue(
      {
        key: "progress:" + a.storyId,
        method: "PUT",
        path: "/api/v1/progress/" + a.storyId,
        body: {
          operationId: port.uuid(),
          expectedRevision: confirmed?.revision ?? 0,
          contentVersion: a.contentVersion,
          contentHash: a.contentHash,
          sceneId: a.sceneId,
          beatId: a.beatId,
          fraction: a.fraction,
          completed,
        },
        ...(ownerId ? { ownerId } : {}),
        changedAt: port.now(),
        conflicts: 0,
      },
      !completed,
    );
  }
  function start() {
    initialize();
    running = true;
    if (stopped) return;
    if (!port.online()) {
      publish({ hydrated: true, status: "offline" });
      return;
    }
    if (!booting && !stopped && port.online())
      booting = port
        .lock(async () => {
          if (resetChanged()) return;
          const version = generation;
          try {
            await hydrate(false, true);
            if (version === generation && !blocked) {
              publish({
                status: data.queue.length
                  ? "local"
                  : data.me
                    ? "saved"
                    : "local",
              });
              if (data.queue.length) schedule(0);
            }
          } catch (error) {
            if (version === generation) failure(error);
          }
        })
        .finally(() => {
          publish({ hydrated: true });
          booting = null;
        });
  }
  function external() {
    initialize();
    if (resetChanged() || stopped) return;
    // Channel/storage events only trigger an authoritative fetch; never accept them as authorization.
    if (port.online() && !flushing && !booting) start();
  }
  function onlineChanged() {
    clearTimeout(timer);
    if (stopped) return;
    if (!port.online()) publish({ status: "offline" });
    else {
      start();
      schedule(0);
    }
  }
  async function eraseOwned() {
    initialize();
    stopped = true;
    blocked = true;
    generation++;
    clearTimeout(timer);
    publish({ status: "deleting", notice: null });
    const marker: ResetRecord = {
      schemaVersion: 1,
      id: port.uuid(),
      phase: "deleting",
    };
    if (!(await persist(undefined, marker))) writeReset(marker);
    port.changed();
    // Shared lock waits for an outstanding session Set-Cookie before deletion expires it.
    try {
      await port.lock(async () => {
        await request("/api/v1/me", "DELETE", {});
      });
      try {
        port.storage().removeItem(LOCAL_CACHE_KEY);
        port.storage().removeItem(SYNC_KEY);
        port.storage().removeItem(PREFERENCES_INTENT_KEY);
        port.storage().removeItem(PREFERENCES_BINDING_KEY);
      } catch {
        writeReset({ ...marker, phase: "failed" });
        publish({
          storageError: true,
          status: "delete-error",
          notice:
            "서버 기록은 삭제했어요. 이 기기의 임시 기록은 지우지 못했어요. 브라우저의 사이트 데이터를 직접 지우거나 삭제를 다시 시도해 주세요.",
        });
        port.changed();
        return false;
      }
      writeReset({ ...marker, phase: "deleted" });
      data = {
        schemaVersion: 1,
        reset: currentReset(),
        epoch: null,
        expiresAt: new Date(port.now() + 30 * 86400000).toISOString(),
        me: null,
        queue: [],
        settled: {},
      };
      publish({
        status: "deleted",
        notice: "이 브라우저의 독서 기록을 삭제했어요.",
      });
      port.changed();
      return true;
    } catch {
      writeReset({ ...marker, phase: "failed" });
      publish({
        status: "delete-error",
        notice:
          "독서 기록을 모두 삭제하지 못했어요. 완료를 확인할 때까지 이 기기의 임시 기록과 요청을 유지하고 자동 저장을 멈췄어요. 삭제를 다시 시도해 주세요.",
      });
      port.changed();
      return false;
    }
  }
  function erase() {
    if (erasing) return erasing;
    erasing = eraseOwned().finally(() => {
      erasing = null;
    });
    return erasing;
  }
  async function resumeOwned() {
    initialize();
    if (state.status !== "delete-error" || erasing) return false;
    const version = ++generation;
    clearTimeout(timer);
    publish({
      notice: "기존 독서 세션을 확인하고 있어요. 확인 전까지 저장은 멈춰요.",
    });
    return port.lock(async () => {
      try {
        if (resetChanged() || version !== generation) return false;
        const value = await request("/api/v1/me");
        if (version !== generation || resetChanged()) return false;
        if (
          !isTransport("Me", value) ||
          !data.epoch ||
          value.session.epoch !== data.epoch
        )
          throw new TransportFailure(401, "SESSION_CHANGED");
        if (!(await adopt(value)) || version !== generation || resetChanged())
          return false;
        const marker: ResetRecord = {
          schemaVersion: 1,
          id: port.uuid(),
          phase: "active",
        };
        if (!(await persist(undefined, marker))) {
          writeReset({ ...marker, phase: "failed" });
          throw new Error("LOCAL_RESUME_UNAVAILABLE");
        }
        if (version !== generation || resetChanged()) return false;
        stopped = false;
        blocked = false;
        retries = 0;
        publish({
          status: data.queue.length ? "local" : "saved",
          notice: "삭제 요청을 취소하고 기존 독서 기록으로 돌아왔어요.",
        });
        port.changed();
        schedule(0);
        return true;
      } catch (error) {
        if (version !== generation || resetChanged()) return false;
        publish({
          status: "delete-error",
          notice:
            error instanceof TransportFailure && error.status === 401
              ? "기존 세션을 확인하지 못해 임시 요청을 새 세션에 보내지 않았어요. 기록 삭제를 다시 시도해 정리할 수 있어요."
              : "기존 기록의 저장을 재개하지 못했어요. 임시 기록은 유지하고 있으니 연결과 저장 공간을 확인한 뒤 다시 시도해 주세요.",
        });
        return false;
      }
    });
  }
  function resumeAfterFailedDeletion() {
    if (resuming) return resuming;
    resuming = resumeOwned().finally(() => {
      resuming = null;
    });
    return resuming;
  }
  let feedbackFlight: Promise<FeedbackSendResult> | null = null;
  const feedbackRetryAt = new Map<string, number>();
  function sendFeedback(
    input: FeedbackWrite,
    expectedEpoch: string,
  ): Promise<FeedbackSendResult> {
    initialize();
    const rejected = (message: string): FeedbackSendResult => ({
      status: "rejected",
      message,
    });
    const scoped = () =>
      !resetChanged() &&
      !stopped &&
      !blocked &&
      data.epoch === expectedEpoch &&
      Boolean(data.me);
    if (!isTransport("FeedbackWrite", input))
      return Promise.resolve(rejected("평가 항목을 다시 선택해 주세요."));
    if (!scoped())
      return Promise.resolve(
        rejected(
          "저장 기준이 바뀌었어요. 현재 기록을 확인한 뒤 다시 보내 주세요.",
        ),
      );
    if (!port.online())
      return Promise.resolve({
        status: "retryable",
        message:
          "오프라인에서는 평가를 보내지 않아요. 연결 후 다시 보내 주세요.",
      });
    const waitUntil = Math.max(
      retryAt,
      feedbackRetryAt.get(input.storyId) ?? 0,
    );
    if (waitUntil > port.now())
      return Promise.resolve({
        status: "retryable",
        message: "잠시 기다린 뒤 같은 평가를 다시 보내 주세요.",
        retryAt: waitUntil,
      });
    if (feedbackFlight)
      return Promise.resolve(
        rejected("진행 중인 평가의 전송 결과를 먼저 확인해 주세요."),
      );
    const version = generation;
    feedbackFlight = port
      .lock(async (): Promise<FeedbackSendResult> => {
        if (version !== generation || !scoped())
          return rejected(
            "기록 삭제 또는 세션 변경으로 이전 평가를 보내지 않았어요.",
          );
        if (!port.online())
          return {
            status: "retryable",
            message: "연결 후 같은 평가를 다시 보내 주세요.",
          };
        try {
          const value = await request(
            "/api/v1/feedback",
            "POST",
            input,
            false,
            201,
          );
          if (version !== generation || !scoped())
            return rejected(
              "기록이 바뀌어 이전 전송 결과를 표시하지 않았어요.",
            );
          if (!isTransport("FeedbackAccepted", value))
            throw new TransportFailure(503, "INVALID_FEEDBACK_RESPONSE");
          return { status: "accepted" };
        } catch (error) {
          if (version !== generation || !scoped())
            return rejected(
              "기록이 바뀌어 이전 전송 결과를 표시하지 않았어요.",
            );
          if (error instanceof TransportFailure) {
            if (error.status === 429) {
              const until = port.now() + Math.max(1, error.retryAfter) * 1000;
              feedbackRetryAt.set(input.storyId, until);
              return {
                status: "retryable",
                message:
                  error.code === "FEEDBACK_LIMIT"
                    ? "이 작품의 오늘 평가는 5회까지예요. 한국 시간 자정 이후 다시 보내 주세요."
                    : "요청이 많아요. 잠시 기다린 뒤 다시 보내 주세요.",
                retryAt: until,
              };
            }
            if (error.status < 500)
              return rejected(
                error.status === 401
                  ? "세션이 만료됐어요. 이전 평가를 새 세션으로 보내지 않았어요."
                  : "평가를 수락하지 못했어요. 현재 기록을 확인해 주세요.",
              );
          }
          return {
            status: "retryable",
            message:
              "전송 결과를 확인하지 못했어요. 같은 평가를 다시 보내면 중복 저장하지 않아요.",
          };
        }
      })
      .finally(() => {
        feedbackFlight = null;
      });
    return feedbackFlight;
  }
  return {
    getSnapshot: () => {
      initialize();
      return state;
    },
    getServerSnapshot: () => syncServerSnapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start,
    flush,
    canWriteLocal: () => {
      initialize();
      return !resetChanged() && !stopped && sameCacheEpoch();
    },
    savePreferences,
    saveAnchor,
    completeAnchor: (a: ReadingAnchor, ownerId?: string) => {
      initialize();
      if (!validAnchor(a) || resetChanged() || stopped || !sameCacheEpoch())
        return false;
      if (
        data.me?.progress.find((p) => p.storyId === a.storyId)?.completed ||
        data.queue.some(
          (p) =>
            p.key === "progress:" + a.storyId &&
            isTransport("ProgressWrite", p.body) &&
            p.body.completed,
        )
      ) {
        port.changed();
        return true;
      }
      latestAnchors.set(a.storyId, {
        anchor: a,
        ...(ownerId ? { ownerId } : {}),
      });
      queueAnchor({ ...a, completed: true }, true, ownerId);
      port.changed();
      return true;
    },
    setBookmark: (
      storyId: string,
      contentVersion: number,
      targetId: string,
      desired: boolean,
    ) => {
      initialize();
      if (stopped) return false;
      const bookmarks = desiredBookmarks(state);
      if (
        desired &&
        !bookmarks.some(
          (b) => b.storyId === storyId && b.targetId === targetId,
        ) &&
        bookmarks.length >= 64
      ) {
        publish({
          notice:
            "저장 가능한 항목은 64개예요. 기존 항목을 정리한 뒤 다시 저장해 주세요.",
        });
        return false;
      }
      enqueue({
        key: `bookmark:${storyId}:${targetId}`,
        method: desired ? "PUT" : "DELETE",
        path: `/api/v1/bookmarks/${storyId}/${targetId}`,
        body: desired
          ? { operationId: port.uuid(), contentVersion }
          : { operationId: port.uuid() },
        changedAt: port.now(),
        conflicts: 0,
      });
      return true;
    },
    external,
    onlineChanged,
    erase,
    resumeAfterFailedDeletion,
    sendFeedback,
    beginNew: () => {
      if (state.status !== "deleted") return;
      stopped = false;
      blocked = false;
      retryAt = 0;
      generation++;
      writeReset({ schemaVersion: 1, id: port.uuid(), phase: "active" });
      data = {
        schemaVersion: 1,
        reset: currentReset(),
        epoch: null,
        expiresAt: new Date(port.now() + 30 * 86400000).toISOString(),
        me: null,
        queue: [],
        settled: {},
      };
      publish({
        status: "local",
        notice: null,
        hydrated: false,
        initialProgress: null,
      });
    },
    stop: () => {
      running = false;
      clearTimeout(timer);
    },
    // Manual retry preserves operation ids and never bypasses an epoch/content conflict.
    retry: () => {
      if (!blocked) {
        retries = 0;
        start();
        void flush();
      }
    },
  };
}
