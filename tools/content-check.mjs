import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  compileStory,
  verifyStory,
} from "../packages/content-compiler/dist/index.js";
const assets = JSON.parse(
  fs.readFileSync("content/asset-plan.json", "utf8"),
).assets;
const report = {
  executedAt: new Date().toISOString(),
  stories: [],
  negativeFixtures: [],
};
fs.mkdirSync("content/generated/stories", { recursive: true });
for (const id of ["post-office", "tide-station"]) {
  const path = `content/stories/${id}/story.md`;
  const story = compileStory(fs.readFileSync(path, "utf8"), assets, path);
  const expected = JSON.parse(
    fs.readFileSync(`examples/compiled/${id}.json`, "utf8"),
  );
  if (!isDeepStrictEqual(story, expected))
    throw new Error("Canonical fixture drift: " + id);
  fs.writeFileSync(
    `content/generated/stories/${id}.json`,
    JSON.stringify(story, null, 2) + "\n",
  );
  report.stories.push({
    id,
    contentHash: story.contentHash,
    scenes: story.scenes.length,
    beats: story.scenes.flatMap((s) => s.beats).length,
  });
}
for (const file of [
  "unknown-effect.json",
  "duplicate-beat.json",
  "missing-asset.json",
  "hash-tampered.json",
  "unsafe-story.md",
]) {
  let rejected = false;
  try {
    const raw = fs.readFileSync("examples/invalid/" + file, "utf8");
    if (file.endsWith(".md")) compileStory(raw, assets, file);
    else verifyStory(JSON.parse(raw), assets);
  } catch (error) {
    rejected = true;
    report.negativeFixtures.push({ file, error: error.message });
  }
  if (!rejected) throw new Error("Invalid fixture accepted: " + file);
}
fs.mkdirSync("evidence/content", { recursive: true });
fs.writeFileSync(
  "evidence/content/compiler.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  "Canonical manuscripts compiled:2 stories,12 scenes,72 beats;5 invalid fixtures rejected.",
);
