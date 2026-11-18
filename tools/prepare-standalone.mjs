import fs from "node:fs";
import path from "node:path";
export const workspace = path.resolve(import.meta.dirname, "..");
export function prepareStandalone() {
  const output = path.join(workspace, "apps/web/.next/standalone");
  const server = path.join(output, "apps/web/server.js");
  if (!fs.existsSync(server)) throw new Error("STANDALONE_BUILD_REQUIRED");
  const app = path.dirname(server);
  for (const [source, target] of [
    ["apps/web/public", path.join(app, "public")],
    ["apps/web/.next/static", path.join(app, ".next/static")],
  ]) {
    if (fs.existsSync(path.join(workspace, source)))
      fs.cpSync(path.join(workspace, source), target, { recursive: true });
  }
  function stripEnvironment(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.name.startsWith(".env")) {
        fs.rmSync(file, { recursive: entry.isDirectory() });
        continue;
      }
      if (entry.isDirectory() && !entry.isSymbolicLink())
        stripEnvironment(file);
    }
  }
  stripEnvironment(output);
  return { server, app };
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  prepareStandalone();
  console.log(
    "Standalone artifact prepared with public/static assets; environment files excluded.",
  );
}
