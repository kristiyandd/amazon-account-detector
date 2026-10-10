import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("src", import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: [
            "*.test.ts",
            "src/**/*.test.ts",
            "eslint-rules/**/*.test.ts",
            "scripts/**/*.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
        },
      },
    ],
    typecheck: {
      include: ["src/**/*.test-d.ts"],
    },
    coverage: {
      provider: "v8",
      include: ["src/core/**", "src/background/**", "src/popup/**/*.{ts,tsx}"],
      exclude: ["**/*.test.*", "**/*.test-d.ts", "src/background/index.ts", "src/popup/main.tsx"],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 80,
        "src/popup/**": { lines: 80, functions: 80, statements: 80, branches: 70 },
      },
    },
  },
});
