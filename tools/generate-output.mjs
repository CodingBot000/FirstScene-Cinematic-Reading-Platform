import fs from "node:fs/promises";
import * as prettier from "prettier";

export async function writeGenerated(file, source) {
  const options = await prettier.resolveConfig(file);
  const formatted = await prettier.format(source, {
    ...options,
    filepath: file,
  });
  const [mode, extra] = process.argv.slice(2);
  if (extra !== undefined || (mode !== undefined && mode !== "--check"))
    throw new Error("GENERATED_CONTRACT_ARGUMENT_INVALID");
  if (mode === "--check") {
    const existing = await fs.readFile(file, "utf8").catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (existing !== formatted)
      throw new Error("GENERATED_CONTRACT_DRIFT " + file);
    return;
  }
  await fs.writeFile(file, formatted);
}
