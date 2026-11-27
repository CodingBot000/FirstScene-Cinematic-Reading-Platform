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

## 2026-11-28 검색 입력과 표지 전환 검증

- 서버에서 렌더링된 검색창은 클라이언트가 연결되기 전에도 입력을 받습니다. 핸들러가 연결되는 시점에 현재 입력값을 기존 필터 상태에 받아들이고, URL 갱신은 기존 debounce와 현재 라우터를 사용합니다. 입력을 비활성화하면 즉시 입력하거나 JavaScript 없이 제출하는 흐름이 제한됩니다. 검색 전체를 새 URL 저장소로 옮기면 상태·라우터가 바뀌는 범위가 커집니다. [Playwright의 hydration 설명](https://playwright.dev/docs/navigations#hydration)
- 표지와 모션이 활성화된 읽기 링크는 Next Link의 전체 prefetch를 사용합니다. 초기 준비가 일부만 된 링크에서는 클릭 뒤에 대상의 RSC 응답을 추가로 요청했고, 일부 WebKit 시도에서 같은 문서 탐색이 끝났는데도 공유 전환 호출이 없었습니다. 실제로 대상 응답을 모두 받은 다음 카드를 열어 공유 그룹과 읽기 시작의 클립 애니메이션을 검증합니다. 전체 prefetch는 전송량이 늘 수 있어 적용 대상을 전환 링크로 제한하고 초기 탐색과 읽기의 성능 예산을 검증합니다. JavaScript 없는 키보드 탐색은 별도 회귀에서 확인합니다. [React ViewTransition](https://react.dev/reference/react/ViewTransition) · [Next Link transitionTypes](https://nextjs.org/docs/app/api-reference/components/link#transitiontypes) · [WebKit View Transitions](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/)
