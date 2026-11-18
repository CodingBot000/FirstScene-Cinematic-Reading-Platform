export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateRuntimeEnvironment } =
      await import("@firstscene/server-data");
    try {
      validateRuntimeEnvironment(process.env);
    } catch (error) {
      const code =
        error instanceof Error && /^[A-Z_0-9]+$/.test(error.message)
          ? error.message
          : "CONFIGURATION_INVALID";
      console.error(
        JSON.stringify({
          status: "STARTUP_CONFIGURATION_INVALID",
          code,
          secretsPrinted: false,
        }),
      );
      // Next otherwise keeps an unusable process serving500s after a rejected register hook.
      process.exit(1);
    }
  }
}
