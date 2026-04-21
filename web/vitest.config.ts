import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/gen/**",
        "src/test-setup.ts",
        "src/**/*.test.{ts,tsx}",
        "src/__mocks__/**",
        "src/client.ts",
      ],
      thresholds: {
        statements: 99,
        branches: 85,
        functions: 75,
        lines: 99,
      },
    },
  },
});
