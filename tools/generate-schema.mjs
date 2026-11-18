import fs from "node:fs";
const schema = JSON.parse(
  fs.readFileSync("contracts/story.schema.json", "utf8"),
);
fs.writeFileSync(
  "packages/story-schema/src/schema.ts",
  `// Generated from contracts/story.schema.json.\nexport const storySchema = ${JSON.stringify(schema, null, 2)} as const;\n`,
);
