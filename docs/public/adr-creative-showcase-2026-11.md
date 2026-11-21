# ADR — Creative showcase boundaries and motion

**Status:** proposed / validated by CI after the related PR passes. **Scope:** presentation layer only.

## Context and goal

This repository is a working reading application and a creative frontend portfolio.
A stronger visual demonstration is useful, but reading, anonymous session
persistence, keyboard access and reduced-motion behavior must not depend on a GPU.

## Decisions

1. **One shared preview visual contract.** The landing teaser, upcoming shelves
   and discovery page share `PreviewCover` and `PreviewNotice`. A concept
   never acquires a reader route by being listed in the collection.
2. **Pure query model.** Search, filter and URL normalization are pure functions;
   a browser hook alone manages URL synchronization. The user-facing view
   renders results and reports the active selection.
3. **Optional GSAP Flip on desktop.** A dynamically imported plugin captures
   existing card geometry *before* changing filters. The new DOM position is
   animated afterwards. The user never depends on the animation to retrieve
   the same search results; disabled motion uses native grid replacement.
   Text is not faded during transition.
4. **Optional WebGL2 portal.** A single 2D fragment shader renders atmosphere
   behind the landing cover. It is a portfolio showcase, not a reader feature.
   It is imported only for fine-pointer desktop layouts with motion permitted,
   caps the pixel buffer and frame rate, and explicitly deletes GPU resources.
   Static CSS/HTML cover rendering always remains available. A Canvas module
   does not import reader state or touch stored progress.
5. **UI package boundary.** Preserve `@firstscene/ui` exports while dividing
   controls, content, media, forms, dialogs and feedback into focused modules.
   A production consumer import should continue to work without code changes.
6. **Keep sync mutation ownership together.** Only pure DTO selectors are
   extracted. The sync state machine retains single ownership of retries,
   epoch checks, outbox transmission and user record deletion.

## Rejected alternatives

- **WebGL in the reader:** ongoing GPU work harms low-power reading and
  complicates progress/anchor restoration.
- **Replacing the complete page with canvas:** destroys selectable content,
  navigation, semantic HTML and no-JavaScript fallback.
- **Three.js scene graph for a 2D effect:** adds a dependency and setup overhead
  without improving this specific fragment-shader visual.
- **Eagerly bundling GSAP Flip or graphics:** would increase startup cost for
  mobile users who never run these effects.
- **Mass reorganization of persistence code:** large regression and review
  burden, not warranted by the frontend-focused showcase objective.

## Acceptance evidence

The related PR must pass formatting, TypeScript, package boundaries, unit tests,
Chromium/WebKit E2E, WebGL unavailable/reduced-motion fallback tests, asset
verification, accessibility, performance, visual capture and Docker smoke.
A successful preview build is not by itself sufficient evidence of visual
quality; hands-on device review is a distinct follow-up.

## Follow-up

Measure on a real handset and desktop GPU before making any frame-rate or visual
quality claims. If WebGL is unavailable, report the fallback rather than
calling it a successful GPU run.
