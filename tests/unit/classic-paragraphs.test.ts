import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { classicSummaries } from "../../apps/web/lib/classic-catalog";
import { formatClassicParagraphs } from "../../apps/web/lib/classic-paragraphs";

const withoutWhitespace = (text: string) => text.replace(/\s/gu, "");

describe("classic reading paragraph reconstruction", () => {
  it("splits consecutive quoted speech and keeps short reporting clauses", () => {
    const text =
      '그는 문을 열었다. “안녕?” 하고 물었다. "안녕." "또 만나!" 그는 조용히 나갔다.';
    const paragraphs = formatClassicParagraphs(text);
    expect(paragraphs).toEqual([
      { kind: "narration", text: "그는 문을 열었다." },
      { kind: "dialogue", text: "“안녕?” 하고 물었다." },
      { kind: "dialogue", text: '"안녕."' },
      { kind: "dialogue", text: '"또 만나!"' },
      { kind: "narration", text: "그는 조용히 나갔다." },
    ]);
  });

  it("preserves existing source boundaries and quoted terms", () => {
    const text = '첫 문단에 “마음”이라는 단어가 있다.\n다음 문단이다.\n\n"대사입니다."';
    expect(formatClassicParagraphs(text).map((p) => p.text)).toEqual([
      '첫 문단에 “마음”이라는 단어가 있다.',
      "다음 문단이다.",
      '"대사입니다."',
    ]);
  });

  it("retains malformed quotation marks, numbered sections and publication notes", () => {
    const text = '1\n“빠진 닫는 따옴표. “다음 대사!”\n* \n끝이다. 출전:잡지';
    const paragraphs = formatClassicParagraphs(text);
    expect(paragraphs.filter((p) => p.kind === "dialogue")).toHaveLength(2);
    expect(paragraphs.filter((p) => p.kind === "section")).toHaveLength(2);
    expect(paragraphs.at(-1)?.kind).toBe("source");
    expect(withoutWhitespace(paragraphs.map((p) => p.text).join(""))).toBe(
      withoutWhitespace(text),
    );
  });

  it("groups long narration at complete sentence boundaries", () => {
    const sentence = "밤이 깊어지고 마을의 작은 등불이 하나씩 꺼져 갔다.";
    const paragraphs = formatClassicParagraphs(
      Array.from({ length: 100 }, () => sentence).join(" "),
    );
    expect(paragraphs.length).toBeGreaterThan(5);
    expect(paragraphs.every((p) => p.text.endsWith("."))).toBe(true);
    expect(paragraphs.every((p) => p.text.length <= 340)).toBe(true);
  });

  it.each(classicSummaries)(
    "preserves every non-whitespace character and restores reading blocks: $title",
    ({ id }) => {
      const { text } = JSON.parse(
        readFileSync("content/classics/works/" + id + ".json", "utf8"),
      ) as { text: string };
      const paragraphs = formatClassicParagraphs(text);

      expect(paragraphs.length).toBeGreaterThan(20);
      expect(paragraphs.some((p) => p.kind === "dialogue")).toBe(true);
      expect(paragraphs.every((p) => p.text.trim() === p.text)).toBe(true);
      expect(paragraphs.every((p) => p.text.length > 0)).toBe(true);
      expect(paragraphs.every((p) => p.text.length < 1200)).toBe(true);
      expect(withoutWhitespace(paragraphs.map((p) => p.text).join(""))).toBe(
        withoutWhitespace(text),
      );
    },
  );
});
