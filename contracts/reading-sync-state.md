# Reading sync state and verification

`createSyncStore` owns pending writes, response validation, rebase and the shared reset generation. The reader's local store holds browser preferences and the current anchor. The PostgreSQL repository owns confirmed rows and operation receipts. `readingView` derives user-visible state from these sources.

| Event | Store state or action | Invariant |
|---|---|---|
| Start or focus | `loading` while reading the session, then `local`, `saved` or a pending status | Keep the active browser epoch and restore a position only if the explicit location and trusted input allow it. |
| Change while disconnected | `offline` with a bounded, persisted latest intent per key | Preserve the user's latest intent and show its temporary status. |
| Send an intent | `saving` while the outcome is unknown | Keep the pending operation and its revision. |
| Receive a valid ACK | Settle the matching intent and show `saved` when the queue is clear | An older acknowledgement cannot erase a newer intent. A receipt and its mutation share one PostgreSQL transaction. |
| Lose a response | `error` or `saving` while retrying the same operation and body | A committed write can be confirmed through a retry without a second mutation. A definitive revision conflict may safely rebase a new attempt. |
| End session | `expired` for an expired epoch, or `deleting` while a delete is in flight | Fence earlier writes and use the same session and generation when reconciling. |
| Finish deletion | Publish `deleted` only after the server confirms and local cleanup succeeds. Otherwise preserve `delete-error` and pause writes. | Pending state from the previous generation cannot become active again. |
| Change reading position | Anchor follows the latest valid reading action | The furthest ordinal is monotonic and completion requires the explicit action. |

| Cases | Evidence in the repository |
|---|---|
| SY-01 committed response lost | `tests/e2e/sync.spec.ts` commits through the real API, drops the downstream response and checks the replay body, UI state, revision and receipt count in the isolated database. |
| SY-02 old ACK, ambiguous response and latest intent | The same browser file exercises delayed ACK. `tests/unit/reading-sync.test.ts` covers 4 seeded sequences, response validation and conflict limits. |
| SY-03 same-epoch tabs | Browser tests disable BroadcastChannel and verify the existing storage-event fallback. The API exercises CAS and concurrent writes. |
| SY-04 partial outage | `tests/api/maintenance.spec.ts` fences an owned test database, observes readiness and delete 503 with a readable public route, and checks recovery. |
| SY-05 bounded retry | `tests/unit/reading-sync.test.ts` advances a fake clock through Retry-After. `tests/api/state.spec.ts` verifies the real write limit. |
| SY-06 reset and late cookie | The browser deletion tests cover responses received after deletion starts. Unit tests exercise operation, generation and epoch ordering. |
| SY-07 storage degradation | Browser tests force storage quota failure. Unit tests reject invalid durable state. |
| SY-08 page lifecycle | Browser coverage proves a real keepalive attempt on pagehide. A device crash or all bfcache conditions require separate evidence. |
| SY-09 location validation | Browser tests cover explicit hashes and trusted input. API and unit checks cover version and anchor validation. |
| SY-10 browser isolation | Session and database tests use separate isolated sessions. |

Reproduce with `pnpm test:unit` and `pnpm test:e2e -- tests/e2e/sync.spec.ts` using an owned disposable database. The SY-01 test queries the mutation receipt with the owner role only after the test database marker check. The application uses its restricted runtime role.
