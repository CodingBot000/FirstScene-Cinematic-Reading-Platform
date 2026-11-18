# 0002 — Browser reading state synchronization

Accepted technical decision, 2026-11-18. No additional service or package.

The application owns a singleton external store, separate from framework-neutral UI/reader packages. Transport types and the supported validation vocabulary are generated from canonical OpenAPI into the application; client code never imports server-data. The generator fails when a new schema keyword needs a validator implementation.

Local controls/anchors update immediately. The durable outbox retains at most one preference intent, two story progress intents and64 bookmark desired states, with a64KiB UTF8 envelope limit. Per-key replacement timestamps and bounded acknowledgement timestamps prevent an old stored request from reappearing after its acknowledgement. Request payload+operationId freezes before transmission; an uncertain outcome reuses both exactly. A CAS conflict refreshes authoritative state and gets at most one retry with a new operationId/revision. Existing server logic preserves furthest/completed. Stale acknowledgements cannot remove a newer local intent.

Two named same-origin Web Locks serve different purposes: a short outbox read/merge/write lock and a network/session lock. They are always acquired in network→storage order; enqueue takes only storage, preventing a cycle. The latter serializes session issuance and deletion across tabs so deletion waits for outstanding Set-Cookie delivery before expiring that cookie. BroadcastChannel and storage events trigger an authenticated refresh and have no authorization role. Without Web Locks, new session creation fails closed to local reading, with a clear storage message; existing sessions still have server ownership/CAS protection. No unsafe cookie-creation fallback or background worker is introduced.

Progress uses750ms debounce/5s maximum wait, retry1/2/4/8/16/30s plus≤250ms jitter, honors Retry-After and pauses offline. pagehide/hidden flush local state and attempt a small keepalive write. Delivery after unload is not guaranteed. The automatic store stops on expired/changed epoch, content mismatch and repeated conflicts; old epoch queues never create/apply to a fresh cookie.

The first authoritative progress snapshot is distinguished from later acknowledgements. A cache-free cookie visit restores its server anchor if trusted navigation has not happened; explicit URL hashes and trusted scroll take priority. A fresh default session preserves pre-cookie local reading preferences. Later acknowledgements do not reposition a reader.

Deletion writes a non-secret reset marker before acquiring the session lock, stops retries and ignores old generations. On server failure it does not claim deletion and leaves data for retry. On success it removes cache/outbox and the server expires the cookie/cascades rows. Other tabs see the marker and stop. The marker contains no record or token and is retained solely to suppress stale work. A subsequent explicit route visit can start new reading; a deleted settings screen disables editing until navigation.

Tradeoffs: Web Locks reduce throughput across this browser's tabs, acceptable for a small personal reading state domain; PostgreSQL remains the authority across browsers/processes. A compact application store avoids another state/dependency service but requires explicit lifecycle/race tests. This implementation is not identity login, cross-device account sync or a guarantee of unload delivery.

Sources checked 2026-11-18: [W3C Web Locks](https://www.w3.org/TR/web-locks/), [WHATWG Fetch](https://fetch.spec.whatwg.org/). Actual Chromium and WebKit tests supplement specification review; no physical iPhone/human usability claim.
