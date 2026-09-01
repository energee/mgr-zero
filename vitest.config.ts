import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "node_modules/next/dist/compiled/server-only/empty.js"),
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
