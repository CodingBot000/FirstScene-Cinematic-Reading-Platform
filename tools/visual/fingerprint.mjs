import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const sourceRoots = [
  "apps/web",
  "packages/ui",
  "packages/tokens",
  "packages/story-schema",
  "packages/reader-core",
  "packages/reader-react",
  "content/generated",
  "content/classics",
  "pnpm-lock.yaml",
  "package.json",
  "pnpm-workspace.yaml",
  ".npmrc",
  "tsconfig.base.json",
];
const checkRoots = [
  "tests/visual",
  "tools/visual",
  "tools/visual-playwright.config.ts",
  "tools/browser-runtime.mjs",
  "tools/linux-webkit-entry.mjs",
  "tools/linux-webkit-config.ts",
  "tools/linux-visual-playwright.config.ts",
  "Dockerfile.qa",
  "execution/browser-runtime-lock.json",
];
function fingerprint(roots) {
  const files = [
    ...new Set(
      execFileSync(
        "git",
        [
          "ls-files",
          "--cached",
          "--others",
          "--exclude-standard",
          "-z",
          "--",
          ...roots,
        ],
        { encoding: "utf8" },
      )
        .split("\0")
        .filter(Boolean),
    ),
  ].sort();
  const hash = createHash("sha256");
  for (const file of files) {
    if (
      path.basename(file).startsWith(".env") ||
      fs.lstatSync(file).isSymbolicLink()
    )
      throw new Error("UNSAFE_VISUAL_FINGERPRINT_INPUT");
    hash.update(file + "\0");
    hash.update(createHash("sha256").update(fs.readFileSync(file)).digest());
  }
  return { sha256: hash.digest("hex"), files: files.length, roots };
}
export const sourceFingerprint = () => fingerprint(sourceRoots);
export const checkFingerprint = () => fingerprint(checkRoots);
