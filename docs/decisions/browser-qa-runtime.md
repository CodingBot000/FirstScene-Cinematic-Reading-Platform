# Browser QA runtime and fixture isolation

Mac WebKit trusted pointer events were delivered at negative X coordinates although DOM hit testing and button bounds were correct. The original failure and isolated event probes are retained under evidence/feedback/visual-webkit-failure. Product CSS promotion did not repair the driver behavior and was not adopted.

For reproducible QA, FIRSTSCENE_LINUX_WEBKIT=1 explicitly selects an official, digest-pinned Playwright 1.65.1 Noble ARM64 image with the existing Node 24 and pnpm 10.14 pins. Chromium continues to run on macOS. Linux WebKit is an engine test, not evidence of physical iPhone/Safari support. Its actual Korean font fallback and new pixels require separate visual review. A real pointer input preflight runs before the application tests. The image and lock hashes must match their build receipt.

The QA image build uses an empty context and copies no application/private source. Runs mount this repository read-only; mutable outputs and caches use private tmpfs mounts. Functional tests share only the newly owned disposable CI PostgreSQL container network namespace. No host IPC, privileged mode, new permissions, or security profile weakening is used. Each container carries project/run ownership labels; cleanup verifies these before removing only that container. Outputs are copied after execution and checked for symlinks and known secrets; private credentials are removed in cleanup.

The 47 browser cases create more than the approved 30 sessions per network/15 minutes when run against one database. Full runs therefore partition independent spec files into batches of four with a new owned database/server for each batch. All cases run once; limits, assertions, failure results, and skips remain intact. Aggregation rejects missing statistics and preserves all failures/skips/flaky counts, with regression tests for execution proof. API quota assertions retain their own unpartitioned test scope.

QA-R07 now waits for an explicit font-release barrier and for the preceding wheel gesture to settle before measuring the cancellation invariant. Its original less-than-80-pixel assertion remains unchanged. This avoids measuring the tail of native scrolling as a font-triggered scroll. The original failed run is retained.

The runtime is opt-in and does not alter the production image or public ingress settings. Final reports identify both OS/browser profiles and bind source, checker, image, and output hashes. Native browser 200% zoom is verified separately using actual native zoom controls.
