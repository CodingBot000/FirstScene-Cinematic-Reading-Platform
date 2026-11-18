# Deletion state and stale-tab repair

Agent verification2026-11-18. The audit candidate was reproduced against actual PostgreSQL sessions: a held DELETE had not run, yet a peer said the records were deleted. After aborting that request, GET me still returned the same live session. p05-deletion-before-results.json and the two directly extracted trace JPEGs preserve the failure. No raw secret-bearing trace was curated.

The repair uses pending/failed/confirmed reset phases, preserves the bounded outbox during failure and clears record data only after an actual204 and successful local removal. Nonsecret unique generation markers prevent old work from rejoining a fresh lifecycle. The existing shared network lock still drains late session issuance before deletion expires its cookie. A separate local-write check runs before cache mutation, not only before network transmission.

A second actual failing reproduction (p05-stale-cache-before-results.json) disabled old-tab notification delivery, erased records in another tab, started a new tide-station session, then sent the old tab's pagehide. It recreated post-office in the fresh local cache even though its server write was stopped. The fresh local-write gate now prevents that mutation; the exact reproduction asserts both cache and actual server progress contain only tide-station.

Deletion failure also supports a deliberate non-destructive recovery: the user can continue existing records. The store verifies the same live epoch with GET me, resumes the retained queue with a fresh active generation and keeps the original expiry. A different or missing epoch is never supplied a new cookie or old queue. Actual cancellation E2E keeps the same session and persists the retained24px choice. No destructive operation is automatically retried.

Actual checks:
- pnpm test:unit:77/77. Includes failed deletion/reload/retry, legacy/incomplete markers, HTTP200 refusal, local removal denial after204, old cache epoch after corrupt sync data, same-epoch cancellation, different-epoch refusal and marker check before local mutation. Unit ports are controlled faults, not real database evidence.
- pnpm build and strict app typecheck passed. pnpm lint and check:boundaries passed.
- pnpm test:e2e:41/41 Chromium, actual fresh owned PostgreSQL; pnpm test:e2e:webkit:41/41. These include the original reader/settings/asset/SSR/library/sync checks and all three new deletion workflows. Network faults are explicitly injected before the request reaches the real API; real before/after GET me proves surviving/erased state. Cookie expiry/reload, cache/outbox removal, unchanged epoch+expiry on cancellation and no resurrected story are asserted. API/store code contains no mock/auth bypass.
- Before JPEGs plus desktop/mobile pending/failed screenshots were actually opened and compared. Pending/failed views retain24px and provide accurate notices; failed views offer retry and existing-record recovery. The controls pause while data is not cleared. The confirmation-success code is tested by actual401/cookie/cache/outbox/default20px assertions, not an invented response.

Initial fixture correction: aborting preference writes in only the actor tab was insufficient because its legitimate peer drained the shared outbox. The fault now applies to that test context's preference route in both tabs; the application behavior/limits are unchanged. The original fixture failure is preserved separately.

P05-T03 remains PENDING because its feedback predecessor needs the unanswered day-boundary decision. This repair is independent deletion/sync work; it does not claim complete feedback/completion UX or overall product readiness. Human evaluations0. Public deployment remains blocked by provider403, recorded separately.
