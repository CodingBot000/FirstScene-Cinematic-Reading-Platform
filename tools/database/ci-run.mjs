import { spawn } from "node:child_process";
import fs from "node:fs";
import { ownedCiReceipt, privateEnvironment } from "./ci-service.mjs";
try {
  const receipt = ownedCiReceipt();
  const values = {
    ...privateEnvironment(receipt.adminEnvironment),
    ...(fs.existsSync(receipt.runtimeEnvironment)
      ? privateEnvironment(receipt.runtimeEnvironment)
      : {}),
  };
  const [command, ...args] = process.argv.slice(2);
  if (!command) throw new Error("CI_COMMAND_REQUIRED");
  process.exitCode = await new Promise((resolve) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...values },
      stdio: "inherit",
    });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
} catch (error) {
  console.error(
    JSON.stringify({
      status: "CI_COMMAND_FAILED",
      code: /^[A-Z_0-9]+$/.test(error.message)
        ? error.message
        : "CI_COMMAND_UNAVAILABLE",
      secretsPrinted: false,
    }),
  );
  process.exitCode = 1;
}
