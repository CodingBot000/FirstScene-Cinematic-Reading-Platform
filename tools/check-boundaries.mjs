import fs from "node:fs";
import path from "node:path";
const policy = JSON.parse(
  fs.readFileSync("contracts/package-boundaries.json", "utf8"),
);
let failures = 0;
for (const parent of ["packages", "apps"])
  for (const name of fs.readdirSync(parent)) {
    const root = path.join(parent, name);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    );
    if (parent === "packages" && (!pkg.exports || !pkg.types)) {
      console.error("Missing exports/types", name);
      failures++;
    }
    const inspect = (dir) => {
      for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
        if (["node_modules", "dist", ".next"].includes(file.name)) continue;
        const full = path.join(dir, file.name);
        if (file.isDirectory()) {
          inspect(full);
          continue;
        }
        if (!/\.[cm]?[jt]sx?$/.test(file.name)) continue;
        const code = fs.readFileSync(full, "utf8");
        for (const match of code.matchAll(
          /(?:from\s*|import\s*\()?["'](@firstscene\/([^/"']+)([^"']*))["']/g,
        )) {
          const [, spec, dependency, subpath] = match;
          if (
            !policy.allowedInternalDependencies[name]?.includes(dependency) ||
            /\/src(?:\/|$)/.test(subpath)
          ) {
            console.error("Illegal dependency", full, spec);
            failures++;
          }
        }
        if (
          name === "reader-core" &&
          /(?:from\s*|import\s*\()["'](?:react|next|gsap)|\b(?:window|document)\./.test(
            code,
          )
        ) {
          console.error("Core runtime violation", full);
          failures++;
        }
        if (
          [
            "tokens",
            "story-schema",
            "ui",
            "reader-react",
            "reader-core",
          ].includes(name) &&
          /(?:from\s*|import\s*\()["'](?:next|pg|node:fs|node:crypto|@firstscene\/server-data)/.test(
            code,
          )
        ) {
          console.error("Client boundary violation", full);
          failures++;
        }
      }
    };
    inspect(root);
  }
if (failures) process.exit(1);
console.log("Package boundaries passed.");
