import { validateRuntimeEnvironment } from "./runtime-environment.mjs";
try {
  validateRuntimeEnvironment(process.env);
  await import("./apps/web/server.js");
} catch (error) {
  console.error(
    JSON.stringify({
      status: "STARTUP_CONFIGURATION_INVALID",
      code: /^[A-Z_0-9]+$/.test(error.message)
        ? error.message
        : "STARTUP_FAILED",
      secretsPrinted: false,
    }),
  );
  process.exitCode = 1;
}
