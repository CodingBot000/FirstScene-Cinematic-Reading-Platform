# P03-T02 stateless reader core

Pure exports resolve active beats from plain geometry, scene/presentation, version-aware anchor fallback, fractions and clamped scroll restoration, bounded grapheme text-effect plans. No React/DOM/GSAP/database import or retained animation state. General reading removes image/effect presentation; reduced mode keeps static imagery and no text motion.

`pnpm --filter @firstscene/reader-core build` exit0; `pnpm test:unit`38passed including10core cases; `pnpm check:boundaries` exit0. QA-R01 tests boundary/gap/reverse/last/unsorted geometry; QA-R04 tests empty/invalid measurements. Additional cases cover nonsticky mood, ordinary/reduced presentation, retained ID/scene/first fallback, fractions/bounds, monotonic furthest, Korean/combining/family-emoji graphemes and policy fallback. Duration ceilings700/1000ms are checked. These are pure logic tests; renderer scrolling and persistence remain separate tasks.
