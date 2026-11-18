import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/db/**/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 15000,
    hookTimeout: 30000,
    reporters: ["default", "json"],
    outputFile: { json: "evidence/database/test-results.json" },
  },
});
