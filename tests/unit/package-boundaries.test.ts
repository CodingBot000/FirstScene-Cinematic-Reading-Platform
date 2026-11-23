import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { checkBoundaries } from "../../tools/check-boundaries.mjs";

function fixture(files: Record<string, string>, enforceReadingRecords = false) {
  const root = mkdtempSync(join(tmpdir(), "firstscene-boundaries-"));
  const packages = {
    "packages/ui": {
      name: "@firstscene/ui",
      types: "./dist/index.d.ts",
      exports: { ".": "./dist/index.js", "./preview": "./dist/index.js" },
    },
    "apps/web": { name: "@firstscene/web" },
  };
  try {
    for (const [name, content] of Object.entries({
      "packages/ui/src/index.ts": "export type Widget = string;",
      ...Object.fromEntries(
        Object.entries(packages).map(([name, manifest]) => [
          name + "/package.json",
          JSON.stringify(manifest),
        ]),
      ),
      ...files,
    })) {
      const file = join(root, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    return checkBoundaries(root, {
      scope: "@firstscene",
      requireExports: true,
      allowedInternalDependencies: { web: ["ui"], ui: [] },
      forbiddenInClient: ["pg", "server-data"],
      forbiddenInCore: ["react", "window", "document"],
      ...(enforceReadingRecords
        ? {
            readingRecords: {
              featureRoot: "apps/web/features",
              cache: "apps/web/lib/reading-cache.ts",
              publicModules: ["apps/web/features/reading-sync/reading-view.ts"],
            },
          }
        : {}),
    }) as string[];
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

it("accepts public subpaths, type-only edges, dynamic client modules and isolated server modules", () => {
  expect(
    fixture({
      "apps/web/client.ts":
        '"use client"; import type { Widget } from "@firstscene/ui/preview"; import { type Server } from "./server"; import("./motion");',
      "apps/web/motion.ts": 'import "gsap";',
      "apps/web/server.ts":
        'import "server-only"; export type Server = string;',
    }),
  ).toEqual([]);
});

it("rejects undeclared exports, relative source bypass, cycles and transitive client access", () => {
  const errors = fixture({
    "apps/web/client.ts":
      '"use client"; import "./reexport"; import "@firstscene/ui/private"; import "../../packages/ui/src/index";',
    "apps/web/reexport.ts": 'export { server } from "./server";',
    "apps/web/server.ts":
      'import "server-only"; import "./client"; export const server = "server";',
  });
  expect(errors).toEqual(
    expect.arrayContaining([
      expect.stringContaining(
        "Undeclared public export @firstscene/ui/private",
      ),
      expect.stringContaining("Workspace source bypass"),
      expect.stringContaining("Module cycle:"),
      expect.stringContaining(
        "client.ts -> apps/web/reexport.ts -> apps/web/server.ts -> server-only",
      ),
    ]),
  );
});

it("resolves TypeScript paths, package cycles and transitive dependencies through a public entry", () => {
  const errors = fixture({
    "apps/web/tsconfig.json": JSON.stringify({
      compilerOptions: { paths: { "~ui/*": ["../../packages/ui/src/*"] } },
    }),
    "apps/web/client.ts":
      '"use client"; import "@firstscene/ui"; import "~ui/index";',
    "packages/ui/src/index.ts":
      'export * from "./server"; import "@firstscene/web";',
    "packages/ui/src/server.ts": 'import "node:fs";',
  });
  expect(errors).toEqual(
    expect.arrayContaining([
      expect.stringContaining("Workspace source bypass ~ui/index"),
      expect.stringContaining("Package cycle:"),
      expect.stringContaining(
        "client.ts -> packages/ui/src/index.ts -> packages/ui/src/server.ts -> node:fs",
      ),
    ]),
  );
});

it("keeps queue internals private and allows a reading view across features", () => {
  const errors = fixture(
    {
      "apps/web/features/library/public.ts":
        'import "../reading-sync/reading-view";',
      "apps/web/features/completion/ui.ts": 'import "../reading-sync/store";',
      "apps/web/lib/reading-cache.ts":
        'import "../features/reading-sync/reading-view";',
      "apps/web/features/reading-sync/reading-view.ts":
        "export const snapshot = {};",
      "apps/web/features/reading-sync/store.ts": "export const queue = [];",
    },
    true,
  );
  expect(errors).toHaveLength(2);
  expect(errors).toEqual(
    expect.arrayContaining([
      expect.stringContaining("Reading sync internal import"),
      expect.stringContaining("Reading cache must stay independent"),
    ]),
  );
});
