# FirstScene initial design decisions

Review type: agent_design. No human participant research or usability evaluation has been performed.

Two implementation alternatives were compared against docs01/02/16. A centered full-bleed cinematic cover would immerse immediately but competes with text contrast and obscures the ordinary reading choice. The selected asymmetric editorial home keeps the title and CTA on paper, artwork beside it (5:7), and exactly two books below. It matches the specified order, needs one first-view image, and requires no autoplay or carousel.

For the reader, an overlay text-on-image layout has variable contrast and couples motion to legibility. The selected desktop left46% sticky scene/right54% opaque reading surface keeps Korean typography stable and exposes the scene alongside the text. Under1024px, scenes become16:10 inline images in the document flow. No internal scrolling or forced full-screen gaps.

The image concepts are visual guidance only. Canonical story titles, summaries, source manuscript, exact palette, 3:4 cover ratios and UI behavior remain normative when mockup copy or crops vary. The home concept uses restrained rules, typographic wordmark, large serif heading, rust rectangular CTA, and horizontal book presentations. The concept is agent-selected under existing design delegation; it is not human approval or a product screenshot.

## Responsive/state inventory

| Surface |1440x1000|1024x768|390x844|320x740|
|---|---|---|---|---|
|Home/discover|1200max, hero5:7,2books|2columns if legible|image, heading36, CTA,1column|16px gutter, wrapping nav and heading|
|Story introduction|320px cover beside text|cover+text|cover<=70%, text below|one column,44px actions|
|Reader|1280max,46:54,34rem text|inline stage and text|inline16:10 art,20px reading|short title,44px toolbar targets|
|Library/settings/about|stacked semantic sections|same|same|no horizontal overflow|

Every surface must cover loading, empty, error and image failure. Skeleton count<=3, no fake books/history. Library has separate local/server/error labels. Discover zero results includes filter reset. DB failure leaves SSR text readable and explains paused sync. Offline status says local temporary storage. Saved status requires server acknowledgement. Unknown story gives404. Missing images retain dimensions and mood fallback; they cannot satisfy the release asset gate.

Reader settings are immediate, focus-trapped with Escape/focus restoration. OS reduced motion has precedence. Re-entry hash wins over stored anchor; user scrolling cancels restoration. Final completion is an explicit CTA, never inferred solely from scroll. Browser-scoped opaque cookie sessions provide no cross-device account sync. Data deletion has its own in-product confirmation.

All four viewport screenshots, keyboard/zoom/reflow and actual app comparison remain future validation tasks. No visual pass score is assigned from these concepts alone.

## Concept observations and deviations

Home: good clear5:7 hero and two-book section, paper/rust/teal family. Mockup summaries and button labels in the preference section are not canonical copy; use source manuscript and normal/cinematic/reduced-motion terminology. Reader: clear split and readable opaque surface; ignore its illustrated inner scrollbar and preserve one document scroll as required. Actual background production prompts must be generated independently, not extracted from UI concepts.

Two native concept calls completed, models unknown, no paid API. Count both against total22 attempts, leaving20 including16 required production sources and4 optional retries. Native call prompt2 is byte-identical to reader-concept-prompt.txt. Concept1 prompt was shortened at invocation; prompt file represents the brief, not exact invocation bytes (correction recorded in ledger).

Documentation validation initially incorrectly scanned third-party node_modules JSON and README links. Updated traversal to prune dependencies/builds/symlinks while retaining project-owned files and added a regression. Recheck17groups passed; checker tests run separately. This is documentation validation only.
