import { it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, IconButton, ResponsiveAsset, StoryCard } from "@firstscene/ui";
it("P01 loading prevents repeated native button activation without removing label", () => {
  const html = renderToStaticMarkup(
    createElement(Button, { loading: true }, "저장"),
  );
  expect(html).toContain('disabled=""');
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain("저장");
});
it("P01 icon buttons retain accessible label and pressed semantics", () => {
  const html = renderToStaticMarkup(
    createElement(IconButton, {
      label: "문장 저장 해제",
      icon: "★",
      pressed: true,
    }),
  );
  expect(html).toContain('aria-label="문장 저장 해제"');
  expect(html).toContain('aria-pressed="true"');
});
it("P01 assets reject remote URLs and traversal while retaining a stable fallback", () => {
  for (const path of [
    "https://evil.invalid/file.webp",
    "/assets/../../secret.webp",
    "data:image/svg+xml,script",
  ]) {
    const html = renderToStaticMarkup(
      createElement(ResponsiveAsset, {
        variants: [{ path, format: "webp", width: 400, height: 300 }],
        alt: "그림",
      }),
    );
    expect(html).not.toContain("<img");
    expect(html).toContain('aria-label="그림"');
    expect(html).toContain("aspect-ratio:16 / 10");
  }
});
it("P01 story card uses independent sibling action rather than nesting buttons in links", () => {
  const html = renderToStaticMarkup(
    createElement(StoryCard, {
      id: "sample",
      title: "작품",
      summary: "소개",
      cover: { variants: [], alt: "표지" },
      href: "/story",
      tags: [],
      action: createElement(Button, null, "저장"),
    }),
  );
  expect(html).not.toMatch(/<a[^>]*>(?:(?!<\/a>)[\s\S])*<button/);
  expect(html).toContain("<h3");
});
