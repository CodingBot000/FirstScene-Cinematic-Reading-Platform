import fs from "node:fs";
import { parse } from "yaml";
import { writeGenerated } from "./generate-output.mjs";
const api = parse(fs.readFileSync("contracts/api.openapi.yaml", "utf8"));
function rewrite(value) {
  if (Array.isArray(value)) return value.map(rewrite);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === "$ref"
          ? item.replace("#/components/schemas/", "#/$defs/")
          : rewrite(item),
      ]),
    );
  return value;
}
const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://firstscene.invalid/schema/api-v1.json",
  $defs: rewrite(api.components.schemas),
};
await writeGenerated(
  "packages/server-data/src/api-schema.ts",
  `// Generated from contracts/api.openapi.yaml.\nexport const apiSchema=${JSON.stringify(schema, null, 2)} as const;\n`,
);
