import path from "node:path";
import { defineConfig } from "@playwright/test";
import type { PlaywrightTestConfig } from "@playwright/test";
const root = path.resolve(import.meta.dirname, "..");
export function linuxWebkitConfig(
  base: PlaywrightTestConfig,
  directory: string,
  consumer = false,
) {
  const output = process.env.FIRSTSCENE_BROWSER_REPORT;
  if (
    process.platform !== "linux" ||
    !output ||
    !output.startsWith(root + "/evidence/")
  )
    throw new Error("OWNED_LINUX_REPORT_REQUIRED");
  let webServer = base.webServer;
  if (webServer) {
    const values = Array.isArray(webServer) ? webServer : [webServer];
    webServer = values.map((v) => ({
      ...v,
      cwd: root,
      command: v.command.includes("tools/start-web.mjs")
        ? v.command + " --prepared"
        : v.command,
    }));
  }
  if (consumer)
    webServer = {
      command:
        "python3 -m http.server 6007 --bind 127.0.0.1 --directory /firstscene-consumer",
      url: "http://127.0.0.1:6007",
      reuseExistingServer: false,
    };
  return defineConfig({
    ...base,
    testDir: path.join(root, "tests", directory),
    outputDir: path.join(root, "artifacts/private/linux-webkit-results"),
    reporter: [["list"], ["json", { outputFile: output }]],
    metadata: {
      ...base.metadata,
      firstsceneRuntime: {
        platform: process.platform,
        node: process.version,
        arch: process.arch,
        imageId: process.env.FIRSTSCENE_QA_IMAGE_ID,
      },
    },
    projects: base.projects
      ?.filter((p) => p.name?.includes("webkit"))
      .map((p) => ({ ...p, testDir: path.join(root, "tests", directory) })),
    webServer,
  });
}
