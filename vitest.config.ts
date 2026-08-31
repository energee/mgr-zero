import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", ".agents/orchestration/tests/**/*.test.mjs"],
    testTimeout: 20000,
    fileParallelism: false,
    env: loadEnv("", process.cwd(), ""),
  },
});
