import { createHash } from "node:crypto";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import { parseDocument, visit, isAlias } from "yaml";
import { assertStory, canonicalJson } from "@firstscene/story-schema";
import type {
  Story,
  Scene,
  Beat,
  AssetReference,
} from "@firstscene/story-schema";
type AstNode = {
  type: string;
  name?: string;
  value?: string;
  attributes?: Record<string, string | null>;
  children?: AstNode[];
  position?: {
    start: { line: number; column: number; offset?: number };
    end: { offset?: number; line: number };
  };
};
export function contentHash(story: Record<string, unknown>): string {
  const body = { ...story };
  delete body.contentHash;
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}
export function verifyStory(
  story: unknown,
  assets: readonly AssetReference[],
): asserts story is Story {
  assertStory(story, assets);
  if (story.contentHash !== contentHash(story))
    throw new Error("CONTENT_HASH_MISMATCH");
}
export function compileStory(
  source: string,
  assets: readonly AssetReference[],
  filename = "story.md",
): Story {
  const text = source
    .normalize("NFC")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
  const fail = (code: string, node?: AstNode): never => {
    throw new Error(
      `${filename}:${node?.position?.start.line ?? 1}:${node?.position?.start.column ?? 1} ${code}`,
    );
  };
  const root = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkDirective)
    .parse(text) as AstNode;
  const children = root.children ?? [];
  const header = children[0];
  if (header?.type !== "yaml") return fail("FRONTMATTER_REQUIRED", header);
  const yaml = parseDocument(header.value ?? "", {
    uniqueKeys: true,
    customTags: [],
  });
  if (yaml.errors.length || yaml.warnings.length)
    return fail(
      "UNSAFE_YAML: " +
        [...yaml.errors, ...yaml.warnings].map((e) => e.message).join("; "),
      header,
    );
  visit(yaml, (_key, node) => {
    if (
      node &&
      typeof node === "object" &&
      (isAlias(node) ||
        ("tag" in node && node.tag) ||
        ("anchor" in node && node.anchor))
    )
      fail("YAML_ALIAS_OR_TAG_FORBIDDEN", header);
  });
  const meta = yaml.toJS({ maxAliasCount: 0 }) as Record<string, unknown>;
  if (!meta || typeof meta !== "object" || Array.isArray(meta))
    return fail("FRONTMATTER_OBJECT_REQUIRED", header);
  if ("scenes" in meta || "contentHash" in meta)
    return fail("GENERATED_FIELD_IN_SOURCE", header);
  function attrs(
    node: AstNode,
    allowed: string[],
    required: string[],
  ): Record<string, string> {
    const value = node.attributes ?? {};
    if (
      Object.keys(value).some((key) => !allowed.includes(key)) ||
      Object.values(value).some((v) => typeof v !== "string")
    )
      return fail("UNKNOWN_OR_EMPTY_ATTRIBUTE", node);
    for (const key of required)
      if (!value[key]) return fail("MISSING_ATTRIBUTE " + key, node);
    const line = text.split("\n")[node.position!.start.line - 1] ?? "";
    const names = Array.from(
      line.matchAll(/\b([A-Za-z][\w-]*)\s*=/g),
      (m) => m[1],
    );
    if (new Set(names).size !== names.length)
      return fail("DUPLICATE_ATTRIBUTE", node);
    return value as Record<string, string>;
  }
  const scenes: Scene[] = [];
  const lines = text.split("\n");
  function requireClose(node: AstNode, marker: string): void {
    if (lines[(node.position?.end.line ?? 0) - 1]?.trim() !== marker)
      fail("EXPLICIT_DIRECTIVE_CLOSE_REQUIRED", node);
  }
  for (const node of children.slice(1)) {
    if (node.type !== "containerDirective" || node.name !== "scene")
      return fail("ONLY_SCENE_CONTAINERS_ALLOWED", node);
    requireClose(node, "::::");
    const a = attrs(
      node,
      ["id", "title", "background", "mood", "portrait"],
      ["id", "title", "background", "mood"],
    );
    const beats: Beat[] = [];
    for (const beat of node.children ?? []) {
      if (beat.type !== "containerDirective" || beat.name !== "beat")
        return fail("ONLY_BEAT_CONTAINERS_ALLOWED", beat);
      requireClose(beat, ":::");
      const b = attrs(
        beat,
        ["id", "kind", "speaker", "mood", "effect"],
        ["id"],
      );
      const nodes = beat.children ?? [];
      if (nodes.length !== 1 || nodes[0]?.type !== "paragraph")
        return fail("ONE_PARAGRAPH_PER_BEAT", beat);
      const inline = nodes[0].children ?? [];
      if (!inline.length || inline.some((n) => n.type !== "text"))
        return fail("PLAIN_TEXT_ONLY_NO_HTML_LINKS_CODE_OR_MDX", beat);
      const body = inline.map((n) => n.value ?? "").join("");
      if (!body.trim() || /[<>]/.test(body))
        return fail("UNSAFE_OR_EMPTY_TEXT", beat);
      beats.push({
        id: b.id!,
        kind: (b.kind ?? "narration") as Beat["kind"],
        speaker: b.speaker ?? null,
        text: body,
        mood: (b.mood ?? a.mood) as Beat["mood"],
        effect: (b.effect ?? "none") as Beat["effect"],
      });
    }
    scenes.push({
      id: a.id!,
      title: a.title!,
      backgroundAssetId: a.background!,
      portraitAssetId: a.portrait ?? null,
      mood: a.mood as Scene["mood"],
      beats,
    });
  }
  const output = { ...meta, scenes, contentHash: "" };
  output.contentHash = contentHash(output);
  try {
    verifyStory(output, assets);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "STORY_INVALID");
  }
  return output;
}
