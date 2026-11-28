import { afterEach, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createSyncStore,
  desiredBookmarks,
} from "../../apps/web/features/reading-sync/store";
import {
  bounded,
  decodeDurable,
  SYNC_KEY,
  RESET_KEY,
  decodeReset,
  replacePending,
  PREFERENCES_INTENT_KEY,
  PREFERENCES_BINDING_KEY,
} from "../../apps/web/features/reading-sync/outbox";
import type { SyncPorts } from "../../apps/web/features/reading-sync/store";
import { createReaderStore } from "../../apps/web/features/reading-sync/local-store";
import {
  defaultPreferences,
  LOCAL_CACHE_KEY,
} from "../../apps/web/lib/reading-cache";
import type { Pending } from "../../apps/web/features/reading-sync/outbox";
import type { Me } from "../../apps/web/features/reading-sync/transport.generated";
const makeMe = (): Me => ({
  session: {
    epoch: randomUUID(),
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  },
  preferences: {
    mode: "cinematic",
    effects: "full",
    fontSize: 20,
    theme: "dark",
    revision: 0,
  },
  progress: [],
  bookmarks: [],
  serverPersistence: true,
});
const response = (value: unknown, status = 200) =>
  Response.json(value, { status });
const error = (code: string, status: number, revision = 0) =>
  response(
    {
      error: {
        code,
        message: "test",
        requestId: randomUUID(),
        details: { currentRevision: revision },
      },
    },
    status,
  );
function harness(
  handler?: (path: string, init: RequestInit) => Promise<Response>,
  memory = new Map<string, string>(),
  stateLock?: SyncPorts["stateLock"],
) {
  let online = true,
    foreground = true;
  const me = makeMe();
  const calls: { path: string; init: RequestInit }[] = [];
  const store = createSyncStore({
    storage: () => ({
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value);
      },
      removeItem: (key) => {
        memory.delete(key);
      },
    }),
    fetch: async (path, init = {}) => {
      calls.push({ path: String(path), init });
      if (handler) return handler(String(path), init);
      if (path === "/api/v1/me") return response(me);
      if (path === "/api/v1/preferences") {
        const p = JSON.parse(String(init.body));
        me.preferences = {
          mode: p.mode,
          effects: p.effects,
          fontSize: p.fontSize,
          theme: p.theme,
          revision: me.preferences.revision + 1,
        };
        return response(me.preferences);
      }
      if (String(path).startsWith("/api/v1/progress/")) {
        const p = JSON.parse(String(init.body));
        const progress = {
          storyId: String(path).split("/").at(-1)!,
          contentVersion: p.contentVersion,
          contentHash: p.contentHash,
          sceneId: p.sceneId,
          beatId: p.beatId,
          fraction: p.fraction,
          completed: p.completed,
          furthestOrdinal: 0,
          revision: p.expectedRevision + 1,
          updatedAt: new Date().toISOString(),
        };
        me.progress = [progress];
        return response(progress);
      }
      throw new Error("unexpected path");
    },
    online: () => online,
    foreground: () => foreground,
    uuid: randomUUID,
    now: () => Date.now(),
    random: () => 0,
    lock: async (action) => action(),
    stateLock,
    changed: () => {},
  });
  return {
    store,
    memory,
    me,
    calls,
    online: (v: boolean) => {
      online = v;
    },
    foreground: (v: boolean) => {
      foreground = v;
    },
  };
}
afterEach(() => {
  vi.useRealTimers();
});
it("P05 outbox replaces per-key intent and rejects quota, duplicates, malformed body and UTF8 excess", () => {
  const item: Pending = {
    key: "preferences",
    path: "/api/v1/preferences",
    method: "PUT",
    changedAt: Date.now(),
    conflicts: 0,
    body: {
      mode: "plain",
      effects: "full",
      fontSize: 20,
      theme: "dark",
      operationId: randomUUID(),
      expectedRevision: 0,
    },
  };
  expect(
    replacePending([item], {
      ...item,
      body: { ...item.body, operationId: randomUUID() },
    }),
  ).toHaveLength(1);
  expect(bounded([item, item])).toBe(false);
  const bookmarks = Array.from({ length: 65 }, (_, i) => ({
    key: `bookmark:post-office:target-${i}`,
    path: `/api/v1/bookmarks/post-office/target-${i}`,
    method: "PUT" as const,
    changedAt: Date.now(),
    conflicts: 0,
    body: { contentVersion: 1, operationId: randomUUID() },
  }));
  expect(bounded(bookmarks.slice(0, 64))).toBe(true);
  expect(bounded(bookmarks)).toBe(false);
  expect(
    bounded([{ ...item, body: { ...item.body, fontSize: 999 } as never }]),
  ).toBe(false);
  expect(() => decodeDurable("가".repeat(30000), "")).toThrow(/LIMIT/);
});
it("P05 offline changes persist one latest preference; no network until explicit reconnect/flush and ack", async () => {
  const h = harness();
  h.online(false);
  h.store.savePreferences({ ...defaultPreferences, fontSize: 22 });
  h.store.savePreferences({ ...defaultPreferences, fontSize: 24 });
  await h.store.flush();
  expect(h.calls).toHaveLength(0);
  expect(h.store.getSnapshot().status).toBe("offline");
  expect(JSON.parse(h.memory.get(SYNC_KEY)!).queue).toHaveLength(1);
  h.online(true);
  await h.store.flush();
  expect(h.store.getSnapshot()).toMatchObject({ status: "saved", queue: [] });
  expect(h.me.preferences.fontSize).toBe(24);
});
it("SY-02 seeded offline and online preference sequences converge to the latest intent", async () => {
  vi.useFakeTimers();
  const sizes = [18, 20, 22, 24] as const;
  for (const seed of [5, 29, 97, 4129]) {
    const h = harness();
    let state = seed;
    let online = true;
    let expected: (typeof sizes)[number] = 20;
    for (let step = 1; step <= 64; step++) {
      vi.setSystemTime(Date.UTC(2026, 10, 28, 0, 0, seed % 60, step));
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const command = (state >>> 16) % 7;
      if (command < sizes.length) {
        expected = sizes[command]!;
        h.store.savePreferences({ ...defaultPreferences, fontSize: expected });
      } else if (command < 6) {
        online = command === 4;
        h.online(online);
      } else {
        const requests = h.calls.length;
        await h.store.flush();
        if (online) {
          expect(h.me.preferences.fontSize, `seed ${seed}, step ${step}`).toBe(
            expected,
          );
          expect(h.store.getSnapshot().queue).toHaveLength(0);
        } else {
          expect(h.calls).toHaveLength(requests);
          expect(h.store.getSnapshot().queue.length).toBeLessThanOrEqual(1);
        }
      }
    }
    h.online(true);
    await h.store.flush();
    expect(h.me.preferences.fontSize, `seed ${seed}`).toBe(expected);
    expect(h.store.getSnapshot().queue).toEqual([]);
    h.store.stop();
  }
});
it("P05 late ack cannot remove/overwrite a newer preference intent; next write uses confirmed revision", async () => {
  const me = makeMe();
  let release!: (r: Response) => void;
  const sent: Record<string, unknown>[] = [];
  const h = harness(async (path, init) => {
    if (path === "/api/v1/me") return response(me);
    const body = JSON.parse(String(init.body));
    sent.push(body);
    if (sent.length === 1)
      return new Promise((resolve) => {
        release = resolve;
      });
    if (body.expectedRevision !== me.preferences.revision)
      return error("REVISION_CONFLICT", 409, me.preferences.revision);
    me.preferences = {
      ...me.preferences,
      fontSize: body.fontSize,
      revision: 2,
    };
    return response(me.preferences);
  });
  h.store.savePreferences({ ...defaultPreferences, fontSize: 22 });
  const flushing = h.store.flush();
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  h.store.savePreferences({ ...defaultPreferences, fontSize: 24 });
  me.preferences = { ...me.preferences, fontSize: 22, revision: 1 };
  release(response(me.preferences));
  await flushing;
  expect(sent.map((p) => p.expectedRevision)).toEqual([0, 0, 1]);
  expect(sent[1]!.operationId).not.toBe(sent[2]!.operationId);
  expect(h.store.getSnapshot().me?.preferences.fontSize).toBe(24);
  expect(h.store.getSnapshot().queue).toHaveLength(0);
});
it("P05 uncertain-outcome retries preserve exact operationId and payload instead of changing CAS input", async () => {
  vi.useFakeTimers();
  const me = makeMe();
  const bodies: string[] = [];
  const h = harness(async (path, init) => {
    if (path === "/api/v1/me") return response(me);
    bodies.push(String(init.body));
    if (bodies.length === 1) throw new TypeError("response lost");
    return response({ ...me.preferences, fontSize: 24, revision: 1 });
  });
  h.store.savePreferences({ ...defaultPreferences, fontSize: 24 });
  await h.store.flush();
  expect(h.store.getSnapshot().status).toBe("error");
  await vi.advanceTimersByTimeAsync(1000);
  await h.store.flush();
  expect(bodies[1]).toBe(bodies[0]);
  expect(h.store.getSnapshot().status).toBe("saved");
});
it("P05 a pre-cookie intent binds to its first epoch before an uncertain mutation and cannot migrate", async () => {
  const me = makeMe();
  const h = harness(async (path) => {
    if (path === "/api/v1/me") return response(me);
    throw new TypeError("response lost");
  });
  h.store.savePreferences({ ...defaultPreferences, fontSize: 24 });
  const original = h.memory.get(PREFERENCES_INTENT_KEY)!;
  expect(JSON.parse(original).epoch).toBeNull();
  await h.store.flush();
  expect(JSON.parse(h.memory.get(PREFERENCES_BINDING_KEY)!)).toMatchObject({
    epoch: me.session.epoch,
    intentId: JSON.parse(original).pending.intentId,
  });
  h.memory.delete(SYNC_KEY);
  h.memory.delete(LOCAL_CACHE_KEY);
  const next = harness(undefined, h.memory); // Its authoritative epoch is different.
  await next.store.flush();
  expect(next.store.getSnapshot().status).toBe("expired");
  expect(next.calls.map((c) => c.path)).toEqual(["/api/v1/me"]);
  expect(h.memory.get(PREFERENCES_INTENT_KEY)).toBe(original);
});
it("P05 conflict refresh merges safe current state and retries once with new id; repeated conflict stops", async () => {
  const me = makeMe();
  let writes = 0;
  const bodies: Record<string, unknown>[] = [];
  const h = harness(async (path, init) => {
    if (path === "/api/v1/me") {
      if (writes) me.preferences.revision = 3;
      return response(me);
    }
    writes++;
    bodies.push(JSON.parse(String(init.body)));
    return error("REVISION_CONFLICT", 409, 3);
  });
  h.store.savePreferences({ ...defaultPreferences, fontSize: 24 });
  await h.store.flush();
  expect(writes).toBe(2);
  expect(bodies.map((b) => b.expectedRevision)).toEqual([0, 3]);
  expect(bodies[0]!.operationId).not.toBe(bodies[1]!.operationId);
  expect(h.store.getSnapshot()).toMatchObject({ status: "error" });
  await h.store.flush();
  expect(writes).toBe(2);
  expect(h.store.getSnapshot().queue).toHaveLength(1);
});
it("P05 existing epoch401 never creates a new cookie or applies its queued intents to another epoch", async () => {
  const h = harness();
  h.store.savePreferences({ ...defaultPreferences, fontSize: 22 });
  await h.store.flush();
  const durable = JSON.parse(h.memory.get(SYNC_KEY)!);
  const other = makeMe();
  let posts = 0;
  const next = harness(async (path, init) => {
    if (init.method === "POST") posts++;
    if (path === "/api/v1/me") return response(other);
    throw new Error("must not write");
  });
  next.memory.set(SYNC_KEY, JSON.stringify(durable));
  next.store.savePreferences({ ...defaultPreferences, fontSize: 24 });
  next.store.start();
  await vi.waitFor(() =>
    expect(next.store.getSnapshot().status).toBe("expired"),
  );
  await next.store.flush();
  expect(posts).toBe(0);
  expect(next.store.getSnapshot().queue).toHaveLength(1);
});
it("P05 new-session creation is single-flight; deletion waits for late cookie issuance before DELETE", async () => {
  const me = makeMe();
  let issued = false;
  let release!: () => void;
  const order: string[] = [];
  let tail = Promise.resolve();
  const h = harness();
  const store = createSyncStore({
    storage: () => ({
      getItem: (k) => h.memory.get(k) ?? null,
      setItem: (k, v) => {
        h.memory.set(k, v);
      },
      removeItem: (k) => {
        h.memory.delete(k);
      },
    }),
    fetch: async (path, init = {}) => {
      if (path === "/api/v1/session") {
        order.push("create");
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        issued = true;
        order.push("cookie");
        return response(me.session);
      }
      if (init.method === "DELETE") {
        order.push("delete");
        return new Response(null, { status: 204 });
      }
      return issued ? response(me) : error("SESSION_REQUIRED", 401);
    },
    online: () => true,
    foreground: () => true,
    uuid: randomUUID,
    now: () => Date.now(),
    random: () => 0,
    lock: async (action) => {
      const previous = tail;
      let done!: () => void;
      tail = new Promise((resolve) => {
        done = resolve;
      });
      await previous;
      try {
        return await action();
      } finally {
        done();
      }
    },
    changed: () => {},
  });
  store.savePreferences(defaultPreferences);
  const a = store.flush(),
    b = store.flush();
  await vi.waitFor(() => expect(order).toEqual(["create"]));
  const deletion = store.erase();
  release();
  await Promise.all([a, b, deletion]);
  expect(order).toEqual(["create", "cookie", "delete"]);
  expect(store.getSnapshot()).toMatchObject({
    status: "deleted",
    queue: [],
    me: null,
  });
  expect(h.memory.has(SYNC_KEY)).toBe(false);
});
it("P05 progress debounce750ms/max5s and offline timer pause preserve latest intent", async () => {
  vi.useFakeTimers();
  const h = harness();
  h.store.start();
  await vi.advanceTimersByTimeAsync(0);
  const anchor = {
    storyId: "post-office",
    contentVersion: 1,
    contentHash: "a".repeat(64),
    sceneId: "mail-s01",
    beatId: "mail-s01-b01",
    fraction: 0,
    furthestOrdinal: 0,
    completed: false,
  };
  const started = Date.now();
  for (let i = 0; i < 10; i++) {
    h.store.saveAnchor({ ...anchor, fraction: i / 20 });
    await vi.advanceTimersByTimeAsync(500);
  }
  expect(Date.now() - started).toBe(5000);
  expect(
    h.calls.filter((c) => c.path.startsWith("/api/v1/progress/")),
  ).toHaveLength(1);
  h.online(false);
  h.store.onlineChanged();
  h.store.saveAnchor({ ...anchor, fraction: 0.9 });
  await vi.advanceTimersByTimeAsync(60000);
  expect(
    h.calls.filter((c) => c.path.startsWith("/api/v1/progress/")),
  ).toHaveLength(1);
  h.store.stop();
});
it("P05 an old epoch retained only in local cache still blocks silent queue import after cookie expiry", async () => {
  const h = harness(async () => error("SESSION_REQUIRED", 401));
  const epoch = randomUUID();
  h.memory.set(
    "firstscene:cache:v1",
    JSON.stringify({
      schemaVersion: 1,
      sessionEpoch: epoch,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      preferences: defaultPreferences,
      anchors: {},
    }),
  );
  h.store.savePreferences({ ...defaultPreferences, fontSize: 24 });
  await h.store.flush();
  expect(h.store.getSnapshot().status).toBe("expired");
  expect(h.calls.some((c) => c.path === "/api/v1/session")).toBe(false);
});
it("P05 two loaded stores share durable queue keys and acknowledgements prevent stale queue resurrection", async () => {
  const h = harness();
  h.online(false);
  const next = harness(undefined, h.memory);
  next.online(false);
  next.store.getSnapshot();
  h.store.savePreferences({ ...defaultPreferences, fontSize: 22 });
  const a = JSON.parse(h.memory.get(SYNC_KEY)!);
  next.store.saveAnchor({
    storyId: "post-office",
    contentVersion: 1,
    contentHash: "a".repeat(64),
    sceneId: "mail-s01",
    beatId: "mail-s01-b01",
    fraction: 0.2,
    furthestOrdinal: 0,
    completed: false,
  });
  expect(
    JSON.parse(next.memory.get(SYNC_KEY)!)
      .queue.map((i: Pending) => i.key)
      .sort(),
  ).toEqual(["preferences", "progress:post-office"]);
  h.online(true);
  await h.store.flush();
  const confirmed = JSON.parse(h.memory.get(SYNC_KEY)!);
  expect(confirmed.settled.preferences).toBeGreaterThan(0);
  // A previously loaded request cannot reappear after its acknowledgement.
  confirmed.queue = a.queue;
  h.memory.set(SYNC_KEY, JSON.stringify(confirmed));
  const reload = harness();
  reload.memory.set(SYNC_KEY, JSON.stringify(confirmed));
  await reload.store.flush();
  expect(
    reload.calls.filter((c) => c.path === "/api/v1/preferences"),
  ).toHaveLength(0);
});
it("P05 transient hydration retries follow1/2/4/8/16/30s and timers stop offline even without a queued write", async () => {
  vi.useFakeTimers();
  const h = harness(async () => error("STORAGE_UNAVAILABLE", 503));
  const begun = Date.now();
  h.store.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.calls).toHaveLength(1);
  const observed = [Date.now() - begun];
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    await vi.advanceTimersByTimeAsync(delay);
    observed.push(Date.now() - begun);
  }
  expect(h.calls).toHaveLength(8);
  expect(observed).toEqual([0, 1000, 3000, 7000, 15000, 31000, 61000, 91000]);
  expect(h.store.getSnapshot().canRetry).toBe(true);
  h.online(false);
  h.store.onlineChanged();
  await vi.advanceTimersByTimeAsync(60000);
  expect(h.calls).toHaveLength(8);
  h.store.stop();
});
it("P05 a bookmark receipt replay reconciles current GET state instead of displaying a later-deleted bookmark", async () => {
  const me = makeMe();
  const oldReceipt = {
    storyId: "post-office",
    targetId: "mail-s01-b02",
    contentVersion: 1,
    createdAt: new Date().toISOString(),
  };
  const h = harness(async (path) =>
    path === "/api/v1/me" ? response(me) : response(oldReceipt),
  );
  h.store.setBookmark("post-office", 1, "mail-s01-b02", true);
  await h.store.flush();
  expect(h.calls.map((c) => c.path)).toEqual([
    "/api/v1/me",
    "/api/v1/bookmarks/post-office/mail-s01-b02",
    "/api/v1/me",
  ]);
  expect(h.store.getSnapshot().status).toBe("saved");
  expect(h.store.getSnapshot().queue).toEqual([]);
  expect(desiredBookmarks(h.store.getSnapshot())).toEqual([]);
});
it("P05 failed erasure preserves the durable queue across reload and only confirmed retry releases a new generation", async () => {
  const me = makeMe();
  let allowDelete = false;
  const handler = async (path: string, init: RequestInit) => {
    if (path === "/api/v1/me" && init.method === "GET") return response(me);
    if (init.method === "DELETE")
      return allowDelete
        ? new Response(null, { status: 204 })
        : error("STORAGE_UNAVAILABLE", 503);
    throw new TypeError("write offline");
  };
  const h = harness(handler);
  h.store.savePreferences({ ...defaultPreferences, fontSize: 24 });
  await h.store.flush();
  expect(h.store.getSnapshot().queue).toHaveLength(1);
  expect(await h.store.erase()).toBe(false);
  expect(h.store.getSnapshot()).toMatchObject({
    status: "delete-error",
    paused: true,
  });
  expect(JSON.parse(h.memory.get(SYNC_KEY)!).queue).toHaveLength(1);
  expect(decodeReset(h.memory.get(RESET_KEY)!).phase).toBe("failed");
  const reload = harness(handler, h.memory);
  reload.store.start();
  await reload.store.flush();
  expect(reload.calls).toHaveLength(0);
  expect(reload.store.getSnapshot()).toMatchObject({
    status: "delete-error",
    paused: true,
  });
  allowDelete = true;
  expect(await reload.store.erase()).toBe(true);
  expect(h.memory.get(SYNC_KEY)).toBeUndefined();
  expect(h.memory.has(PREFERENCES_INTENT_KEY)).toBe(false);
  expect(h.memory.has(PREFERENCES_BINDING_KEY)).toBe(false);
  const erasedId = decodeReset(h.memory.get(RESET_KEY)!).id;
  expect(decodeReset(h.memory.get(RESET_KEY)!).phase).toBe("deleted");
  h.store.external();
  expect(h.store.getSnapshot()).toMatchObject({
    status: "deleted",
    me: null,
    queue: [],
  });
  reload.store.beginNew();
  expect(decodeReset(h.memory.get(RESET_KEY)!).id).not.toBe(erasedId);
  expect(decodeReset(h.memory.get(RESET_KEY)!).phase).toBe("active");
  h.store.external();
  const requests = h.calls.length;
  h.store.savePreferences(defaultPreferences);
  await h.store.flush();
  expect(h.calls).toHaveLength(requests);
  expect(h.store.getSnapshot().paused).toBe(true);
});
it("P05 legacy or incomplete reset markers pause writes without assuming deletion succeeded", async () => {
  const h = harness();
  h.memory.set(RESET_KEY, randomUUID());
  h.store.start();
  h.store.savePreferences(defaultPreferences);
  await h.store.flush();
  expect(h.calls).toHaveLength(0);
  expect(h.store.getSnapshot()).toMatchObject({
    status: "delete-error",
    paused: true,
  });
});
it("P05 HTTP200 is not a deletion acknowledgement and cannot clear local records", async () => {
  const h = harness(async () => response({ ok: true }));
  h.memory.set(LOCAL_CACHE_KEY, JSON.stringify({ retained: true }));
  expect(await h.store.erase()).toBe(false);
  expect(h.store.getSnapshot().status).toBe("delete-error");
  expect(h.memory.get(LOCAL_CACHE_KEY)).toBeDefined();
  expect(decodeReset(h.memory.get(RESET_KEY)!).phase).toBe("failed");
});
it("P05 local erasure denial after acknowledged204 is reported separately and never marked fully deleted", async () => {
  const memory = new Map<string, string>([[LOCAL_CACHE_KEY, "retained"]]);
  const store = createSyncStore({
    storage: () => ({
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value);
      },
      removeItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
    }),
    fetch: async () => new Response(null, { status: 204 }),
    online: () => true,
    foreground: () => true,
    uuid: randomUUID,
    now: Date.now,
    random: () => 0,
    lock: async (action) => action(),
    changed: () => {},
  });
  expect(await store.erase()).toBe(false);
  expect(store.getSnapshot()).toMatchObject({
    status: "delete-error",
    paused: true,
    storageError: true,
  });
  expect(store.getSnapshot().notice).toContain("서버 기록은 삭제했어요");
  expect(memory.get(LOCAL_CACHE_KEY)).toBe("retained");
  expect(decodeReset(memory.get(RESET_KEY)!).phase).toBe("failed");
});
it("P05 a corrupted sync document cannot discard the old cache epoch and adopt another cookie's state", async () => {
  const next = makeMe(),
    old = randomUUID();
  const h = harness(async () => response(next));
  h.memory.set(SYNC_KEY, '{"bad":true}');
  h.memory.set(
    LOCAL_CACHE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      sessionEpoch: old,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      preferences: defaultPreferences,
      anchors: {},
    }),
  );
  h.store.start();
  await vi.waitFor(() => expect(h.store.getSnapshot().status).toBe("expired"));
  expect(h.store.getSnapshot().initialProgress).toBeNull();
  expect(
    h.calls.some((c) => c.init.method === "POST" || c.init.method === "PUT"),
  ).toBe(false);
});
it("P05 cancelling a failed deletion resumes only the same live epoch and preserves its original expiry", async () => {
  vi.useFakeTimers();
  const me = makeMe();
  const epoch = me.session.epoch,
    expiry = me.session.expiresAt;
  let writable = false;
  const h = harness(async (path, init) => {
    if (path === "/api/v1/me" && init.method === "GET") return response(me);
    if (init.method === "DELETE") return error("STORAGE_UNAVAILABLE", 503);
    if (!writable) throw new TypeError("offline");
    const p = JSON.parse(String(init.body));
    me.preferences = {
      mode: p.mode,
      effects: p.effects,
      fontSize: p.fontSize,
      theme: p.theme,
      revision: 1,
    };
    return response(me.preferences);
  });
  h.store.savePreferences({ ...defaultPreferences, fontSize: 24 });
  await h.store.flush();
  expect(await h.store.erase()).toBe(false);
  writable = true;
  expect(await h.store.resumeAfterFailedDeletion()).toBe(true);
  await vi.advanceTimersByTimeAsync(1000);
  await h.store.flush();
  expect(h.store.getSnapshot()).toMatchObject({
    status: "saved",
    paused: false,
    queue: [],
  });
  expect(me.preferences.fontSize).toBe(24);
  expect(me.session).toEqual({ epoch, expiresAt: expiry });
  expect(h.calls.some((c) => c.path === "/api/v1/session")).toBe(false);
});
it("P05 failed-deletion cancellation never imports a pending old queue into another epoch", async () => {
  const me = makeMe();
  let changed = false;
  const h = harness(async (path, init) => {
    if (path === "/api/v1/me" && init.method === "GET")
      return response(changed ? makeMe() : me);
    if (init.method === "DELETE") return error("STORAGE_UNAVAILABLE", 503);
    throw new TypeError("offline");
  });
  h.store.savePreferences({ ...defaultPreferences, fontSize: 24 });
  await h.store.flush();
  await h.store.erase();
  changed = true;
  expect(await h.store.resumeAfterFailedDeletion()).toBe(false);
  expect(h.store.getSnapshot()).toMatchObject({
    status: "delete-error",
    paused: true,
  });
  expect(h.store.getSnapshot().queue).toHaveLength(1);
  expect(h.calls.some((c) => c.path === "/api/v1/session")).toBe(false);
});
it("P05 local-write permission reads a new generation before any cache mutation despite delayed notifications", () => {
  const h = harness();
  h.store.getSnapshot();
  h.memory.set(
    RESET_KEY,
    JSON.stringify({ schemaVersion: 1, id: randomUUID(), phase: "active" }),
  );
  expect(h.store.canWriteLocal()).toBe(false);
  expect(h.store.getSnapshot()).toMatchObject({
    status: "expired",
    paused: true,
  });
});
it("P05 a valid new sync snapshot cannot silently absorb a cache belonging to another epoch", () => {
  const h = harness(),
    me = makeMe();
  h.memory.set(
    SYNC_KEY,
    JSON.stringify({
      schemaVersion: 1,
      reset: "",
      epoch: me.session.epoch,
      expiresAt: me.session.expiresAt,
      me,
      queue: [],
      settled: {},
    }),
  );
  h.memory.set(
    LOCAL_CACHE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      sessionEpoch: randomUUID(),
      expiresAt: me.session.expiresAt,
      preferences: defaultPreferences,
      anchors: {},
    }),
  );
  expect(h.store.canWriteLocal()).toBe(false);
  expect(h.store.getSnapshot()).toMatchObject({
    status: "expired",
    paused: true,
  });
  expect(h.calls).toHaveLength(0);
});
it("P05 explicit completion remains the single progress intent while a newer reread anchor waits in the existing cache", async () => {
  const me = makeMe();
  const sent: Record<string, unknown>[] = [];
  let revision = 0;
  const h = harness(async (path, init) => {
    if (path === "/api/v1/me") return response(me);
    const p = JSON.parse(String(init.body));
    sent.push(p);
    me.progress = [
      {
        storyId: "post-office",
        contentVersion: p.contentVersion,
        contentHash: p.contentHash,
        sceneId: p.sceneId,
        beatId: p.beatId,
        fraction: p.fraction,
        completed: Boolean(me.progress[0]?.completed || p.completed),
        furthestOrdinal: 35,
        revision: ++revision,
        updatedAt: new Date().toISOString(),
      },
    ];
    return response(me.progress[0]);
  });
  const storage = {
    getItem: (key: string) => h.memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      h.memory.set(key, value);
    },
    removeItem: (key: string) => {
      h.memory.delete(key);
    },
  };
  const local = createReaderStore(undefined, () => storage);
  const last = {
    storyId: "post-office",
    contentVersion: 1,
    contentHash: "a".repeat(64),
    sceneId: "mail-s06",
    beatId: "mail-s06-b06",
    fraction: 1,
    furthestOrdinal: 35,
    completed: true,
  };
  const back = {
    ...last,
    sceneId: "mail-s01",
    beatId: "mail-s01-b02",
    fraction: 0.3,
  };
  h.online(false);
  local.saveAnchor(last);
  h.store.completeAnchor(last, local.owner());
  local.saveAnchor(back);
  h.store.saveAnchor(back, local.owner());
  expect(h.store.getSnapshot().queue).toHaveLength(1);
  expect(h.store.getSnapshot().queue[0]!.body).toMatchObject({
    beatId: last.beatId,
    completed: true,
  });
  h.online(true);
  await h.store.flush();
  expect(sent.map((p) => [p.beatId, p.completed, p.expectedRevision])).toEqual([
    [last.beatId, true, 0],
    [back.beatId, false, 1],
  ]);
  expect(me.progress[0]).toMatchObject({
    beatId: back.beatId,
    completed: true,
    furthestOrdinal: 35,
  });
  expect(h.store.getSnapshot().queue).toEqual([]);
});
it("P05 a superseded delayed409 refreshes the revision without blocking the newer desired choice", async () => {
  const me = makeMe();
  let release!: (value: Response) => void;
  const sent: Record<string, unknown>[] = [];
  const h = harness(async (path, init) => {
    if (path === "/api/v1/me") return response(me);
    const p = JSON.parse(String(init.body));
    sent.push(p);
    if (sent.length === 1)
      return new Promise((resolve) => {
        release = resolve;
      });
    if (p.expectedRevision !== me.preferences.revision)
      return error("REVISION_CONFLICT", 409, me.preferences.revision);
    return response({ ...me.preferences, fontSize: p.fontSize, revision: 2 });
  });
  h.store.savePreferences({ ...defaultPreferences, fontSize: 22 });
  const work = h.store.flush();
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  h.store.savePreferences({ ...defaultPreferences, fontSize: 24 });
  me.preferences.revision = 1;
  release(error("REVISION_CONFLICT", 409, 1));
  await work;
  expect(sent.map((p) => [p.fontSize, p.expectedRevision])).toEqual([
    [22, 0],
    [24, 0],
    [24, 1],
  ]);
  expect(h.store.getSnapshot()).toMatchObject({ status: "saved", queue: [] });
});
it("P05 a synchronous preference intent survives document loss before the state lock runs", async () => {
  const me = makeMe();
  me.preferences = { ...me.preferences, fontSize: 24, revision: 1 };
  const memory = new Map<string, string>();
  memory.set(
    SYNC_KEY,
    JSON.stringify({
      schemaVersion: 1,
      reset: "",
      epoch: me.session.epoch,
      expiresAt: me.session.expiresAt,
      me,
      queue: [],
      settled: {},
    }),
  );
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  };
  const local = createReaderStore(undefined, () => storage);
  local.savePreferences({ ...defaultPreferences, fontSize: 18 });
  const oldDocument = harness(
    undefined,
    memory,
    async () => new Promise<never>(() => {}),
  );
  oldDocument.store.savePreferences({ ...defaultPreferences, fontSize: 18 });
  expect(JSON.parse(memory.get(SYNC_KEY)!).queue).toEqual([]);
  const descriptor = memory.get(PREFERENCES_INTENT_KEY)!;
  expect(JSON.parse(descriptor).pending.body.fontSize).toBe(18);
  // A stale cache writer cannot reverse the latest synchronous choice.
  const cached = JSON.parse(memory.get(LOCAL_CACHE_KEY)!);
  storage.setItem(
    LOCAL_CACHE_KEY,
    JSON.stringify({
      ...cached,
      preferences: { ...defaultPreferences, fontSize: 24 },
    }),
  );
  expect(
    createReaderStore(undefined, () => storage).getSnapshot().preferences
      .fontSize,
  ).toBe(18);
  const bodies: string[] = [];
  const nextDocument = harness(async (path, init) => {
    if (path === "/api/v1/me") return response(me);
    bodies.push(String(init.body));
    const p = JSON.parse(String(init.body));
    expect(p.expectedRevision).toBe(1);
    me.preferences = { ...me.preferences, fontSize: p.fontSize, revision: 2 };
    return response(me.preferences);
  }, memory);
  await nextDocument.store.flush();
  expect(bodies).toEqual([JSON.stringify(JSON.parse(descriptor).pending.body)]);
  expect(nextDocument.store.getSnapshot()).toMatchObject({
    status: "saved",
    queue: [],
  });
  expect(me.preferences.fontSize).toBe(18);
  expect(memory.get(PREFERENCES_INTENT_KEY)).toBe(descriptor);
  // Keeping only the immutable intent must still retain its known epoch and refuse a new cookie.
  memory.delete(SYNC_KEY);
  memory.delete(LOCAL_CACHE_KEY);
  const expiredDocument = harness(
    async () => error("SESSION_REQUIRED", 401),
    memory,
  );
  await expiredDocument.store.flush();
  expect(expiredDocument.store.getSnapshot().status).toBe("expired");
  expect(expiredDocument.calls.some((c) => c.path === "/api/v1/session")).toBe(
    false,
  );
  expect(memory.has(PREFERENCES_INTENT_KEY)).toBe(true);
  expect(memory.has(PREFERENCES_BINDING_KEY)).toBe(false); // It already belonged to a known epoch.
});
it("P05 new choices cannot bypass Retry-After on an already rejected write", async () => {
  vi.useFakeTimers();
  const me = makeMe();
  let writes = 0;
  const h = harness(async (path, init) => {
    if (path === "/api/v1/me") return response(me);
    writes++;
    if (writes === 1)
      return Response.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "wait",
            requestId: randomUUID(),
          },
        },
        { status: 429, headers: { "retry-after": "60" } },
      );
    return response({
      ...me.preferences,
      fontSize: JSON.parse(String(init.body)).fontSize,
      revision: 1,
    });
  });
  h.store.start();
  await vi.advanceTimersByTimeAsync(0);
  h.store.savePreferences({ ...defaultPreferences, fontSize: 22 });
  await h.store.flush();
  expect(writes).toBe(1);
  h.store.savePreferences({ ...defaultPreferences, fontSize: 24 });
  await h.store.flush();
  await vi.advanceTimersByTimeAsync(59999);
  expect(writes).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(writes).toBe(2);
  expect(h.store.getSnapshot().status).toBe("saved");
  h.store.stop();
});
it("feedback is sent only online in its original epoch and never enters the progress/preferences outbox", async () => {
  const h = harness(async (path) =>
    path === "/api/v1/me" ? response(h.me) : response({ accepted: true }, 201),
  );
  await h.store.flush();
  const p = {
    storyId: "post-office",
    code: "helpful" as const,
    operationId: randomUUID(),
  };
  h.online(false);
  expect((await h.store.sendFeedback(p, h.me.session.epoch)).status).toBe(
    "retryable",
  );
  expect(h.calls.filter((c) => c.path === "/api/v1/feedback")).toHaveLength(0);
  h.online(true);
  expect((await h.store.sendFeedback(p, randomUUID())).status).toBe("rejected");
  expect((await h.store.sendFeedback(p, h.me.session.epoch)).status).toBe(
    "accepted",
  );
  expect(h.store.getSnapshot().queue).toEqual([]);
});
it("feedback accepts only201withthecontractbody; uncertain responses do not claim success", async () => {
  let count = 0;
  const h = harness(async (path) => {
    if (path === "/api/v1/me") return response(h.me);
    count++;
    return count === 1
      ? response({ accepted: true }, 200)
      : count === 2
        ? response({ accepted: false }, 201)
        : response({ accepted: true }, 201);
  });
  await h.store.flush();
  const p = {
    storyId: "post-office",
    code: "comfortable" as const,
    operationId: randomUUID(),
  };
  expect((await h.store.sendFeedback(p, h.me.session.epoch)).status).toBe(
    "retryable",
  );
  expect((await h.store.sendFeedback(p, h.me.session.epoch)).status).toBe(
    "retryable",
  );
  expect((await h.store.sendFeedback(p, h.me.session.epoch)).status).toBe(
    "accepted",
  );
  expect(
    h.calls
      .filter((c) => c.path === "/api/v1/feedback")
      .map((c) => c.init.body),
  ).toEqual([JSON.stringify(p), JSON.stringify(p), JSON.stringify(p)]);
});
it("feedback honors RetryAfter across new operation ids without blocking another story", async () => {
  vi.useFakeTimers();
  const h = harness(async (path, init) => {
    if (path === "/api/v1/me") return response(h.me);
    const p = JSON.parse(String(init.body));
    return p.storyId === "tide-station"
      ? response({ accepted: true }, 201)
      : Response.json(
          {
            error: {
              code: "FEEDBACK_LIMIT",
              message: "test",
              requestId: randomUUID(),
            },
          },
          { status: 429, headers: { "retry-after": "2" } },
        );
  });
  await h.store.flush();
  const p = {
    storyId: "post-office",
    code: "helpful" as const,
    operationId: randomUUID(),
  };
  const r = await h.store.sendFeedback(p, h.me.session.epoch);
  expect(r).toMatchObject({ status: "retryable", retryAt: Date.now() + 2000 });
  await h.store.sendFeedback(
    { ...p, operationId: randomUUID() },
    h.me.session.epoch,
  );
  expect(h.calls.filter((c) => c.path === "/api/v1/feedback")).toHaveLength(1);
  expect(
    (
      await h.store.sendFeedback(
        { ...p, storyId: "tide-station" },
        h.me.session.epoch,
      )
    ).status,
  ).toBe("accepted");
  await vi.advanceTimersByTimeAsync(2001);
  await h.store.sendFeedback(p, h.me.session.epoch);
  expect(h.calls.filter((c) => c.path === "/api/v1/feedback")).toHaveLength(3);
});
it("a late feedback acknowledgement after deletion cannot report accepted or recreate old state", async () => {
  let release!: () => void;
  const h = harness(async (path, init) => {
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    if (path === "/api/v1/me") return response(h.me);
    await new Promise<void>((r) => {
      release = r;
    });
    return response({ accepted: true }, 201);
  });
  await h.store.flush();
  const pending = h.store.sendFeedback(
    { storyId: "post-office", code: "helpful", operationId: randomUUID() },
    h.me.session.epoch,
  );
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  expect(await h.store.erase()).toBe(true);
  release();
  expect((await pending).status).toBe("rejected");
  expect(h.store.getSnapshot().me).toBeNull();
});

it("P11 preserves the v1 body and replays the extended wire request unchanged after reload", async () => {
  const disk = new Map<string, string>();
  const me = makeMe();
  const calls: unknown[] = [];
  const h = harness(async (path, init) => {
    if (path === "/api/v1/me") return response(me);
    calls.push(JSON.parse(String(init.body)));
    throw new Error("lost acknowledgement");
  }, disk);
  h.online(false);
  const anchor = {
    storyId: "post-office",
    contentVersion: 1,
    contentHash: "a".repeat(64),
    sceneId: "mail-s02",
    beatId: "mail-s02-b02",
    fraction: 0.2,
    furthestOrdinal: 27,
    completed: false,
  };
  h.store.saveAnchor(anchor);
  h.online(true);
  await h.store.flush();
  const item = JSON.parse(disk.get(SYNC_KEY)!).queue[0];
  expect(item.body).not.toHaveProperty("furthestOrdinal");
  expect(item.progressWire).toMatchObject({
    furthestOrdinal: 27,
    beatId: anchor.beatId,
  });
  expect(item.progressWire.operationId).not.toBe(item.body.operationId);
  const restored = harness(async (path, init) => {
    if (path === "/api/v1/me") return response(me);
    calls.push(JSON.parse(String(init.body)));
    return response({
      ...anchor,
      revision: 1,
      updatedAt: new Date().toISOString(),
    });
  }, disk);
  await restored.store.flush();
  expect(calls).toEqual([item.progressWire, item.progressWire]);
  expect(restored.store.getSnapshot().queue).toHaveLength(0);
});
