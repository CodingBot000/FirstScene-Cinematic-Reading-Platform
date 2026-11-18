import fs from "node:fs";
import { parse } from "yaml";
const api = parse(fs.readFileSync("contracts/api.openapi.yaml", "utf8"));
function expand(value) {
  if (Array.isArray(value)) return value.map(expand);
  if (value && typeof value === "object") {
    if (value.$ref)
      return expand(api.components.schemas[value.$ref.split("/").at(-1)]);
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, expand(v)]),
    );
  }
  return value;
}
const schemas = expand(api.components.schemas);
// Deliberately fail if a contract starts using an unsupported browser keyword.
const keywords = new Set([
  "type",
  "properties",
  "additionalProperties",
  "required",
  "enum",
  "const",
  "format",
  "pattern",
  "minimum",
  "maximum",
  "items",
]);
function check(schema) {
  for (const key of Object.keys(schema))
    if (!keywords.has(key))
      throw new Error("UNSUPPORTED_TRANSPORT_KEYWORD:" + key);
  for (const child of Object.values(schema.properties ?? {})) check(child);
  if (schema.items) check(schema.items);
}
Object.values(schemas).forEach(check);
fs.writeFileSync(
  "apps/web/features/reading-sync/transport.generated.ts",
  `// Generated from contracts/api.openapi.yaml. No server-data runtime dependency.\nimport type { FromSchema } from 'json-schema-to-ts';\nexport const transportSchemas = ${JSON.stringify(schemas, null, 2)} as const;\n${Object.keys(
    schemas,
  )
    .map(
      (name) =>
        `export type ${name} = FromSchema<typeof transportSchemas.${name}>;`,
    )
    .join("\n")}\n`,
);
