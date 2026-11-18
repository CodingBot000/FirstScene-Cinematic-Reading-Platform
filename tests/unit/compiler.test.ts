import { it, expect, describe } from "vitest";
import { readFileSync } from "node:fs";
import {
  compileStory,
  verifyStory,
  contentHash,
} from "@firstscene/content-compiler";
const assets = JSON.parse(
  readFileSync("content/asset-plan.json", "utf8"),
).assets;
const source = readFileSync("content/stories/post-office/story.md", "utf8");
const first = "바다가 보이는 언덕의 우체국은 일몰 뒤에만 문을 열었다.";
describe("P02 canonical safe compiler", () => {
  it("matches the full fixture rather than only counts", () => {
    expect(compileStory(source, assets)).toEqual(
      JSON.parse(readFileSync("examples/compiled/post-office.json", "utf8")),
    );
  });
  it("normalizes BOM, CRLF and decomposed Unicode deterministically", () => {
    expect(
      compileStory(
        "\uFEFF" + source.normalize("NFD").replaceAll("\n", "\r\n"),
        assets,
      ).contentHash,
    ).toBe(compileStory(source, assets).contentHash);
  });
  it.each([
    "<script>alert(1)</script>",
    "[링크](javascript:alert(1))",
    "![이미지](x.png)",
    "`code`",
    "**숨은 강조**",
    ":unknown[x]",
  ])("rejects unsupported inline AST %s", (value) => {
    expect(() =>
      compileStory(source.replace(first, value), assets, "bad.md"),
    ).toThrow(/bad.md:\d+:\d+/);
  });
  it.each([
    "title: &ref 빛을 접어 보내는 우체국",
    "title: !!str 빛을 접어 보내는 우체국",
    "title: 빛을 접어 보내는 우체국\ntitle: 중복",
  ])("rejects unsafe YAML %s", (header) => {
    expect(() =>
      compileStory(
        source.replace("title: 빛을 접어 보내는 우체국", header),
        assets,
      ),
    ).toThrow(/YAML/);
  });
  it("rejects unknown, duplicate attributes and implicit EOF closing", () => {
    expect(() =>
      compileStory(
        source.replace(":::beat{id=", ':::beat{extra="x" id='),
        assets,
      ),
    ).toThrow(/ATTRIBUTE/);
    expect(() =>
      compileStory(
        source.replace(":::beat{id=", ':::beat{id="extra" id='),
        assets,
      ),
    ).toThrow(/ATTRIBUTE/);
    expect(() => compileStory(source.trimEnd().slice(0, -4), assets)).toThrow(
      /CLOSE/,
    );
  });
  it("applies mood overrides to only their own beat", () => {
    const story = compileStory(source, assets);
    expect(story.scenes[0]?.beats[3]?.mood).toBe("tension");
    expect(story.scenes[0]?.beats[4]?.mood).toBe("calm");
  });
  it("rejects hash tampering independently of shape", () => {
    const story = compileStory(source, assets);
    story.scenes[0]!.beats[0]!.text += " 수정";
    expect(() => verifyStory(story, assets)).toThrow(/HASH/);
    expect(contentHash(story)).not.toBe(story.contentHash);
  });
  it("accepts four emphasis beats and rejects a fifth even when every emphasized sentence is short", () => {
    const story = compileStory(source, assets);
    expect(
      story.scenes
        .flatMap((scene) => scene.beats)
        .filter((beat) => beat.effect !== "none"),
    ).toHaveLength(4);
    const fifth = source
      .replace(
        'id="mail-s01-b01" kind="narration"',
        'id="mail-s01-b01" kind="narration" effect="reveal"',
      )
      .replace(story.scenes[0]!.beats[0]!.text, "빛이 도착했다.");
    expect(() => compileStory(fifth, assets)).toThrow(/EFFECT_COUNT/);
  });
  it("rejects oversized emphasis and nonexistent speakers/assets", () => {
    expect(() =>
      compileStory(
        source.replace(
          "보낸 사람 칸에는 아무 이름도 없었다.",
          "가".repeat(121),
        ),
        assets,
      ),
    ).toThrow(/EFFECT_LENGTH/);
    expect(() =>
      compileStory(
        source.replace('speaker="clerk"', 'speaker="nobody"'),
        assets,
      ),
    ).toThrow(/SPEAKER/);
    expect(() =>
      compileStory(
        source.replace('background="mail-bg-01"', 'background="missing"'),
        assets,
      ),
    ).toThrow(/ASSET_REFERENCE/);
  });
});
