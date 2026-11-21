# Architecture, module responsibilities and verification contracts

## Intent

FirstScene deliberately has two bounded experiences: a **creative presentation
surface** that may use WebGL and GSAP, and a **reading application** whose
content, save state and navigation must remain usable without advanced motion.
This distinction is essential to evaluating the design and the engineering.

## Dependency boundaries

| Layer | Owner | Depends on | Does not own |
| --- | --- | --- | --- |
| Next.js App Router | `apps/web/app` | features, shared packages | low-level reading calculations |
| Discovery model | `apps/web/lib/discovery-model.ts` | canonical card types, preview metadata | URL events, GSAP, persistence |
| Discovery query hook | `apps/web/components/useDiscoveryQuery.ts` | URL parsing/serialization | catalog filtering |
| Shared preview | `apps/web/components/preview/*` | preview types, UI dialog | authenticated reader routes or DB |
| GSAP catalog motion | `apps/web/components/useCatalogFlip.ts` | optional Flip plugin | query state rules |
| WebGL shader | `apps/web/lib/graphics/cover-portal.ts` | native WebGL2 | reader, network, storage |
| Portal lifecycle | `CoverPortalLayer.tsx` | lazy WebGL shader | scene text or state |
| Cinematic scene model | `apps/web/lib/cinematic-scenes.ts` | plain scene metadata | rendering/scroll runtime |
| Reader adapter | `packages/reader-react` | reader-core, shared UI | persistent storage protocol |
| Reader logic | `packages/reader-core` | story schema | React, GSAP, browser DOM |
| Session state and sync | `apps/web/features/reading-sync/store.ts` | transport validation, durable outbox | presentation animation |
| Read-only sync mapping | `apps/web/features/reading-sync/selectors.ts` | DTO types, outbox item types | writes, retry or storage |
| Backend | `packages/server-data` | PostgreSQL, schema | page layout and graphics |

`contracts/package-boundaries.json` and `tools/check-boundaries.mjs`
enforce package imports. External React/Vite consumer smoke checks that the
published UI/reader packages still work outside the Next.js application.

## State transitions and flows

### Search and discovery

```text
URL /discover?q=...&status=...
     ↓ parse / canonicalize
useDiscoveryQuery (browser URL lifecycle)
     ↓ DiscoveryFilters
filterDiscovery (pure, testable)
     ↓ ready stories + unpublished previews
Discovery (semantic grid)
     ↓ optional geometry snapshot
useCatalogFlip (progressive animation only)
```

The filter rules do not depend on animation. Selecting an upcoming-only shelf
while “read now” is active moves to upcoming content; selecting “read now”
clears an incompatible preview-only genre. A broken animation cannot create
an unreadable preview reader route.

### Reading and persistence

```text
Canonical story JSON → Server-rendered manuscript
                    → ReaderController
                    → reader-react (DOM + motion)
                    → reader-core (position/anchor functions)
                    → local-store + reading-sync/outbox
                    → /api/v1/... → PostgreSQL
```

Read-only selectors project server DTOs and optimistic bookmark intent.
Write order, receipt handling, epochs, retries, CAS conflict resolution and
record deletion stay co-located in the tested sync state machine.
No new manuscript data or database migration is required for preview concepts.

### Creative graphic lifecycle

```text
Desktop >=1024px, >=700px, fine pointer, motion allowed?
  no → semantic HTML + ordinary CSS covers
  yes → lazy GSAP ScrollTrigger
      → optional lazy WebGL2 canvas + shader
      → max DPR/viewport buffer and capped animation frames
      → resize/context loss/viewport change/unmount: dispose resources
```

The shader draws atmospheric light behind readable content; it does not draw
story text, buttons or navigation. Neither screen readers nor reader
navigation depend on WebGL. See
[Creative showcase ADR](adr-creative-showcase-2026-11.md).

## Component architecture

`@firstscene/ui` preserves its public named exports but delegates to
`controls.tsx`, `typography.tsx`, `media.tsx`, `story-card.tsx`,
`dialog.tsx`, `forms.tsx`, and `feedback.tsx`.

Styles are organized by layer: global foundations in `site.css`, specific
preview and discovery styles with their components, `cinematic-prologue.css`
for the opening, and `mobile-journey.css` for small-screen surface contracts.
The design token source remains `design/tokens.json`.

## Failure isolation

- WebGL compilation or context loss → CSS-only visual fallback
- Reduced motion or touch layout → no pinned landing scroll or GPU work
- No JavaScript → server-rendered two complete manuscripts
- DB unavailable → public manuscripts remain viewable; save feedback reports its state
- Offline queued change → optimistic local state with explicit sync status
- Record deletion → waits for server acknowledgment; failure is recoverable

These are deliberate contracts, not claims that every runtime or phone has
been manually inspected.

## Required evidence for each change

A pull request should record its scope and rejected alternatives, preserve
stable module exports, run unit and Chromium/WebKit browser checks, confirm
the no-JS/reduced-motion path, check tab focus, accessibility, Lighthouse,
responsive captures, and run Docker smoke. Maintain the state machine's
existing regression suite before splitting any mutation logic.

**Human device review is separate from automatic CI** and should be recorded
as an open limit until performed.
