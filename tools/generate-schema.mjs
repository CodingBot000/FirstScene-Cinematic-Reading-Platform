import fs from "node:fs";
import { writeGenerated } from "./generate-output.mjs";
const schema = JSON.parse(
  fs.readFileSync("contracts/story.schema.json", "utf8"),
);
await writeGenerated(
  "packages/story-schema/src/schema.ts",
  `// Generated from contracts/story.schema.json.\nexport const storySchema = ${JSON.stringify(schema, null, 2)} as const;\n`,
);
