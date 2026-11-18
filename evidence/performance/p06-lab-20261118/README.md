# P06 independent performance verification

Actual command pnpm test:perf exit0 on2026-11-18. It builds Storybook, verifies all16public images/92variants, measures9production Lighthouse navigations, runs4real browser checks against a fresh owned PostgreSQL server, verifies report freshness/hash/counts and960pxfirst-image sizes. No mock DB/auth bypass, no public deployment. Root command now fails on collection errors, missing evidence or budget violations; it is not an echo/skip gate. Code commit is in index; collection began against its unchanged committed application base before the new test producer was committed.

| Route | Median LCP ms | Median CLS | Median TBT ms | JS gzip bytes | Median transfer bytes |
|---|---:|---:|---:|---:|---:|
| Home | 951.329 | 0 | 41.052 | 153523 | 243881 |
| Introduction | 947.647 | 0 | 33.692 | 165677 | 220272 |
| Reader | 585.276 | 0.000588 | 36.728 | 171723 | 216699 |

Each route has3cold Chromium profiles, production standalone build, Apple M4 Max/macOS arm64,4xCPU, DevTools150ms request latency/1638.4Kbps down/750Kbps up,390x844DPR1. These pass the declared navigation lab budgets; not field p75 or INP. Browser/version/config/individual variance is in retained audit JSON. Fonts0bytes reflects system font stacks, not an optimized downloaded font. Exact960px first background AVIF/WebP files for both stories are34,127/71,040 and38,054/70,128bytes, each below180KiB with matching hashes. Actual reader requested-script gzip171,723bytes includes runtime and is below300KiB.

Actual production Event Timing with4xCPU: maximum observed duration toolbar88ms, plain-mode24ms, Escape24ms, bookmark16ms. Trusted-event to two-rAF paint proxies were77.8/29.5/17/30.6ms. These proxies are explicitly different from native Event Timing/INP; API durations are rounded and events below16ms may be absent. All observed actions remained under200ms. Six forward/reverse jumps plus a2second animation tail yielded28intermediate-opacity frames and no>50ms long tasks over2268ms. This narrow lab workload does not guarantee all-device FPS or field latency.

Actual shared renderer lifecycle: Chromium and WebKit each20measured mount/unmount cycles after one documented framework/GSAP warmup. Every cycle had2actual GSAP global timeline children before removal and0after, with window/document/MediaQueryList listeners and active ResizeObservers equal to the warm baseline. DOM once-listeners are excluded from this instrumentation; this is not an exhaustive heap-leak proof. The introspection hook exists only in a developer Storybook fixture, never in the product application/public package API. No renderer behavior was changed to pass these checks.

Plain entry made0requests for the actual compiled GSAP-containing chunk and rendered no stage. Fresh cinematic entry requested only mail-bg-01/mail-bg-02, rather than all scenes. Both checks use actual production network requests. Existing main functional full44/44 Chromium/WebKit remain separate evidence; no whole-product readiness claim.

Preserved initial failure was a new test fixture looking for the invented radio label 장면 연출 rather than the real 연출 읽기. It timed out; the fixture was corrected and its assertions retained. The final4/4passed after the animation tail was extended to cover the whole fade/text effect. Root result.json preserves original collection-time current/ paths; index.json identifies relocated immutable artifacts with verified hashes. Raw Lighthouse traces/JSON stay ignored, not public artifacts.

P06-T02 remains PENDING because its predecessor (including unresolved feedback day policy) is incomplete. This is independent verified preparation, not task-DONE, WCAG certification, human review or release readiness. Human reviews0.
