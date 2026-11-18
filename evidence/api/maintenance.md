# P04 maintenance/deletion verification — partial task

Observed 2026-11-17T20:53Z. Agent verification, no human review.

Implemented DELETE /api/v1/me: exact Origin/JSON/Empty validation even without a cookie; a valid-format own token deletes the parent session (including expired sessions), cascades preferences/progress/bookmarks/receipts/feedback and removes that session's HMAC write bucket. The cookie expires only after commit. Repeated deletion returns204. No deletion receipt survives its deleted parent. An absent/invalid cookie needs no DB to report that no identifiable session was deleted.

Bounded cleanup runs before authenticated API work/session issuance: up to5 expired candidates per table, receipts then rate buckets then sessions, FOR UPDATE SKIP LOCKED. The owned local `pnpm db:cleanup` command uses100-row batches, at most100 batches, reports only aggregate counts, and does not run a background worker or presume a cron service. Expiry timestamps retain the approved30-day/24-hour/15-minute policies. FK cascades may delete children of each selected session; statement timeouts still apply.

Actual validation:
- pnpm test:db:15/15 including expired-token deletion, all five child cascades, A/B preservation, stale context rejection, live-record preservation, exact batch counts, locked-session skip and later cleanup.
- pnpm build: production standalone artifact prepared; owner environment files excluded.
- pnpm test:api:22/22, including actual cookie expiry/repeat204, request guards and a real temporary connection outage scoped to the wrapper-created ownership-verified UUID test DB. Readiness/deletion503, public full story200, no expired cookie on failed deletion, same epoch after recovery.
- pnpm lint; pnpm check:boundaries: passed. pnpm db:cleanup: actual local runtime-role invocation, zero expired records, one bounded batch.

Initial failures retained in p04-maintenance-initial-results.json. PostgreSQL refuses ALLOW_CONNECTIONS false from inside the affected DB; fixture corrected to use an admin connection to postgres, terminate only this disposable DB's runtime connections, restore in finally. Production behavior/assertions unchanged. ESLint also encountered Playwright deleting test-results concurrently; generated outputs are now globally ignored so lint does not traverse transient test artifacts.

P04-T04 remains IN_PROGRESS: feedback quota's day boundary is still PENDING_USER in execution/decisions.json. No midnight/rolling default was silently chosen. The feedback endpoint remains unimplemented; this evidence does not mark the whole task complete.
