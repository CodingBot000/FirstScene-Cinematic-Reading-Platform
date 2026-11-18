import fs from "node:fs";
import { createHash } from "node:crypto";
const source = fs.readFileSync("design/tokens.json", "utf8");
const tokens = JSON.parse(source);
const declarations = [];
function flatten(value, path = []) {
  for (const [key, item] of Object.entries(value)) {
    const next = [...path, key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())];
    if (item && typeof item === "object" && !Array.isArray(item))
      flatten(item, next);
    else if (!Array.isArray(item))
      declarations.push(
        `  --fs-${next.join("-")}: ${typeof item === "number" && /(?:px|ms)$/.test(next.at(-1)) ? item + (/ms$/.test(next.at(-1)) ? "ms" : "px") : item};`,
      );
  }
}
flatten({
  primitive: tokens.primitive,
  typography: tokens.typography,
  motion: tokens.motion,
});
for (const [key, value] of Object.entries(tokens.semantic.light))
  declarations.push(`  --fs-${key}: ${value};`);
let css = `/* Generated from design/tokens.json; do not edit. */\n:root {\n${declarations.join("\n")}\n}\n`;
for (const [theme, values] of Object.entries(tokens.semantic)) {
  if (theme === "moods") continue;
  css += `[data-theme="${theme}"] {\n${Object.entries(values)
    .map(([k, v]) => `  --fs-${k}: ${v};`)
    .join("\n")}\n}\n`;
}
for (const [name, value] of Object.entries(tokens.semantic.moods))
  css += `[data-mood="${name}"] { --fs-mood: ${value}; }\n`;
fs.mkdirSync("packages/tokens/dist", { recursive: true });
fs.writeFileSync("packages/tokens/dist/tokens.css", css);
fs.writeFileSync(
  "packages/tokens/dist/tokens.json",
  JSON.stringify(tokens, null, 2) + "\n",
);
fs.writeFileSync(
  "packages/tokens/src/index.ts",
  `// Generated from design/tokens.json.\nexport const tokens = ${JSON.stringify(tokens, null, 2)} as const;\nexport const sourceHash = '${createHash("sha256").update(source).digest("hex")}';\n`,
);
const luminance = (hex) =>
  hex
    .slice(1)
    .match(/../g)
    .map((s) => parseInt(s, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
    .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
const pairs = tokens.contrastPairs.map((pair) => {
  const a = luminance(pair.fg),
    b = luminance(pair.bg);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  if (ratio < pair.minimum) throw new Error("Contrast failed: " + pair.name);
  return { ...pair, ratio };
});
fs.mkdirSync("evidence/design", { recursive: true });
fs.writeFileSync(
  "evidence/design/contrast.json",
  JSON.stringify(
    {
      sourceHash: createHash("sha256").update(source).digest("hex"),
      scope:
        "opaque token pairs only; browser intermediate frames require visual QA",
      pairs,
    },
    null,
    2,
  ) + "\n",
);

fs.writeFileSync("packages/tokens/dist/css.d.ts", "export {};\n");
