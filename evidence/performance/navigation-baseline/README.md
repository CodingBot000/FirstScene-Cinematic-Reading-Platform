# Production navigation baseline

Actual2026-11-18 collection: nine Lighthouse13.6.0 CLI runs against the production standalone build, a fresh owned PostgreSQL database, no authentication bypass, fresh temporary Chromium profiles from Playwright. Apple M4 Max/macOS arm64/Node24.5.0. Each home/introduction/reader route ran three times. CPU slowdown4×; DevTools network request latency150ms, download1638.4Kbps/upload750Kbps; mobile390×844/DPR1. Actual config/browser version/environment are retained per audit. These are lab measurements, not field p75/INP.

| Route | Median LCP ms | Median CLS | Median TBT ms | Initial JS gzip bytes | Median total transfer bytes |
|---|---:|---:|---:|---:|---:|
| Home | 958.13 | 0 | 28.402 | 153523 | 243881 |
| Introduction | 918.99 | 0 | 32.526 | 165677 | 220270 |
| Reader | 605.219 | 0.000588 | 34.665 | 171723 | 216698 |

All three navigation medians pass LCP2500ms/CLS0.1/TBT200ms. All observed transfers remain below1.4MiB, reader requested-script gzip is below300KiB. The script sum deduplicates actual requested script URLs and gzips the exact corresponding production build files, including runtime. This is distinct from the measured HTTP transfer. Fonts transfer0: current application uses system font stacks, no downloaded Noto/font resource was observed. Reader first cold load requested the actual480pxAVIF background (10598bytes including transfer overhead); no all-scene preloading was observed in these navigation reports. Plain-mode GSAP0 is separately tested by E2E, not inferred from this default cinematic run.

The tiny reader CLS traces identify the save-status text; no large plain→cinematic layout shift appeared in this profile. No speculative layout rewrite was made. The original collection summary preserves collection-time current/ paths and raw report hashes; the corresponding retained selected diagnostics are relocated here and indexed by real file hash. Full raw Lighthouse JSON remains in ignored current/ and is not a public artifact. The collector source commit refers to the committed application base; the collector itself was committed after this initial execution (index.collectorCommit). Final checks must rerun after application changes.

The initially noninteractive Lighthouse CLI automatically created a default error-reporting preference file. Its exact sole false value and birth/mtime at the first owned run were checked, and only that newly created file was removed. The collector now explicitly passes --no-enable-error-reporting, avoiding the configstore prompt/write path and telemetry without changing existing user preferences. The isolated server start/stop helper was smoke-tested again after cleanup handling was tightened. No credentials were inherited by Lighthouse/Chromium; runtime-only credentials stayed in the owned local server. Database and server were stopped after collection.

Interaction Event Timing, long-task animation traces,20mount listener/tween checks, native zoom, final visuals/security/CI remain unverified. Root test:perf remains incomplete until its full producer exists. P06-T02 remains PENDING due its predecessor, not DONE from this independent baseline. Human reviews0. LOCAL_PRODUCT_READY/PUBLIC_RELEASE_READY are false.
