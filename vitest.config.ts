import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Test configuration.
 *
 * Split into two projects rather than using `environmentMatchGlobs`, because
 * that option is deprecated and the split is clearer: server/shared code runs
 * in Node where `node:sqlite` and Node crypto exist, while DOM component tests
 * need jsdom.
 */
const alias = {
  "@": path.resolve(import.meta.dirname, "./src"),
  "@shared": path.resolve(import.meta.dirname, "./shared"),
};

const nodeInclude = [
  "tests/**/*.test.ts",
  "shared/**/*.test.ts",
  "server/**/*.test.ts",
  "src/lib/**/*.test.ts",
];

const domInclude = [
  "tests/ui/**/*.test.tsx",
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
];

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["shared/**/*.ts", "server/**/*.ts", "src/lib/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "**/index.ts"],
    },
    testTimeout: 20_000,
    hookTimeout: 20_000,
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "server",
          environment: "node",
          globals: true,
          setupFiles: ["./tests/setup.node.ts"],
          include: nodeInclude,
          exclude: ["**/node_modules/**", "**/dist/**", "**/dist-server/**", "src/**/*.dom.test.ts*"],
          testTimeout: 20_000,
          hookTimeout: 20_000,
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "dom",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./tests/setup.dom.ts"],
          include: domInclude,
          exclude: [
            "**/node_modules/**",
            "**/dist/**",
            "**/dist-server/**",
            "src/lib/**/*.test.ts",
            "**/*.dom.test.ts",
          ],
          testTimeout: 20_000,
          hookTimeout: 20_000,
        },
      },
    ],
  },
});
