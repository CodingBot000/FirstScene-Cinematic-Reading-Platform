import { pipeline } from "./pipeline.mjs";
const [action, ...args] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--") continue;
  if (args[i].startsWith("--"))
    flags[args[i].slice(2)] = args[i + 1]?.startsWith("--")
      ? true
      : (args[++i] ?? true);
}
const tool = pipeline();
let result;
if (action === "plan") result = tool.validatePlan();
else if (action === "begin") result = tool.begin(flags.id, flags.note);
else if (action === "import")
  result = await tool.importFile(flags.id, flags.file, flags.provider);
else if (action === "review")
  result = tool.review(flags.id, Number(flags.score), flags.notes);
else if (action === "optimize") result = await tool.optimize();
else if (action === "preview") result = await tool.optimize({ partial: true });
else if (action === "verify") result = await tool.verify();
else if (action === "api") tool.denyPaid();
else throw new Error("Unknown asset command");
console.log(JSON.stringify(result, null, 2));
