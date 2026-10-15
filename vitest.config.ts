import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@shared": path.resolve(import.meta.dirname, "./shared"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.node.ts"],
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "shared/**/*.test.ts",
      "server/**/*.test.ts",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/dist-server/**"],
    environmentMatchGlobs: [
      ["tests/ui/**", "jsdom"],
      ["src/**/*.dom.test.tsx", "jsdom"],
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["shared/**/*.ts", "server/**/*.ts", "src/lib/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "**/index.ts"],
    },
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
