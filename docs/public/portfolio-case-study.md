# FirstScene — Product Design & AI-Native Engineering Case Study

## Product and portfolio brief

FirstScene asks whether a reading experience can connect **a short sentence
with a memorable visual scene**, without making the reader dependent on
animation. It is a working application and an engineering portfolio, not an
attempt to simulate a paid platform with 36 finished novels.

The technical brief places deliberate emphasis on design judgment, creative
frontend, reusable React components, responsive interactions, performance,
accessibility, AI agent oversight and end-to-end deployment.

## What to see in the live demo

[Live FirstScene](https://firstscene-one.vercel.app/)

1. **Desktop opening.** Scroll through three semantic scenes. With WebGL2
   available, a GPU fragment shader creates a moving atmospheric portal
   behind the covers; without it, the illustrated HTML layout stays usable.
   Keyboard links, static fallback and reduced motion remain available.
2. **Explore.** Switch published/upcoming status, genre and mood. The 34
   unpublished concepts are honest previews. On eligible desktops, GSAP Flip
   animates geometry changes while the pure filter determines the result.
3. **Read.** Open either complete story, switch plain/cinematic presentation
   and observe anchor restoration and reading controls.
4. **Save.** Use bookmarks and the personal library without signing up.
   Offline/error/expiry states are shown rather than pretending all saves
   succeeded.

## Key design problem and correction

### Mobile visual hierarchy

The original landing grouped two artwork images before three text scenes.
On phones, that DOM relationship displayed pictures at the top with their
individual descriptions far below. The result was readable but visually
disconnected, despite the responsive test detecting no horizontal overflow.

**Decision:** a `CinematicScene` now owns one image, one description and
one navigational action. Wide screens can pin/scrub; narrow screens preserve
normal document flow with each illustration beside or above its own copy.
The 320px version stacks related elements for legibility. Image/content
pairing, header visibility and mode-switch cleanup have dedicated tests.

### Contrast during animation

A subtle opacity entrance on entire cards lowered effective text contrast
during automatic screenshot/axe checks. It was replaced with an in-place
motion-only entrance. The lesson is not “avoid animation”: **animate position
without reducing essential text contrast**.

## Creative frontend design decisions

| Decision | Benefit | Cost / rejected alternative |
| --- | --- | --- |
| WebGL2 shader portal behind the opening | Shows native graphics engineering, GPU ownership and art direction | More GPU work; no shader in the reader, no canvas-only page |
| GSAP ScrollTrigger for three scenes | Controlled scroll timeline and semantic scene linkage | Pinning is restricted to appropriate desktop layouts |
| GSAP Flip on discovery selection | Makes UI state changes legible and visually expressive | Extra plugin work; ordinary grid updates remain valid without it |
| Shared `PreviewCover` + `PreviewNotice` | One visual vocabulary and publication contract across routes | Less one-off freedom for individual card variants |
| Query model + URL hook | Separates pure result correctness from browser navigation | Additional files; justified by independent tests |
| Keep sync mutation engine intact | Avoids breaking epoch/deletion/outbox invariants for cosmetic code cleanup | Leaves a long but tested state machine; read-only selectors extracted only |

The focus is **intentional visual extravagance within a controlled boundary**.
Showcase motion can be theatrical even when it is unnecessary for ordinary
novel reading. Text and user records must not pay the same reliability cost.

## Engineering architecture and ownership

The Next.js route layer composes `Discovery`, `CinematicPrologue`,
`ReaderController` and the library. The discovery model does not own
DOM access, while animation modules own no persistence state.
`@firstscene/ui` maintains stable exports through role-focused files.
The React-independent `reader-core` calculates anchor state; the
`reader-react` adapter owns rendering; `server-data` handles API and
PostgreSQL access. [Full module guide](architecture-and-decisions.md).

For persistent reading state, the client has an anonymous cookie-backed
server session, offline write queue, revision checks and idempotent receipts.
These details are exercised against a disposable real PostgreSQL database
in CI. The 34 previews are **not** inserted into the database.

## AI-Native workflow and human judgment

AI coding agents generated and revised implementation work in multiple PRs.
The project owner specified constraints, accepted or rejected trade-offs and
required visible verification records. ChatGPT later used GitHub operations
for scoped refactors, a WebGL implementation and test-driven corrections.

The review process surfaces defects instead of hiding them:

- A mobile screenshot led to a structural DOM change, not a CSS-only patch.
- Browser/visual CI showed a real contrast regression during opacity motion.
- A GPU render pass was simplified from a per-pixel particle loop to a
  bounded tiled starfield to limit computation.
- A WebGL nullable-context TypeScript error was found by actual CI and fixed.
- Temporary format/compile workflows were used only for feature work and
  removed; full CI remains authoritative.

No unsupported claim is made about which parts were typed by a human rather
than generated by an agent. The assessable artifact is the **record of
requirements, decisions, corrected failures, tests and deployed code**.

## Reproducible evaluation

See the exact commands and verified run IDs in [RELEASE_REPORT.md](../../RELEASE_REPORT.md).
The pipeline includes lint/type/boundaries, real database/API cases,
Chromium/WebKit, accessibility, security negatives, resource/lifecycle
performance, visual capture, external package consumption and Docker smoke.
It is intentionally broader than a “build succeeded” badge.

## Honest limits and future work

- Human usability interviews, real-device animations, device-specific Safari
  rendering and production-user FPS were not established by CI.
- WebGL may be unavailable on a given browser; the fallback is a legitimate
  and intentionally tested result.
- Preview concepts have no full manuscripts.
- A passed automated CI run is not proof of product-market fit or a
  formal independent security audit.

The submission demonstrates **creative judgment plus engineering control**,
not the pretense that a demo has already solved every product operation.
