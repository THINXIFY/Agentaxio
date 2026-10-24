import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: ["./test/support/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    passWithNoTests: true,
  },
});
