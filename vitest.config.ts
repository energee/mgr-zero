import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    fileParallelism: false,
    env: loadEnv("", process.cwd(), ""),
  },
});
