import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "."),
      "server-only": fileURLToPath(
        new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)
      ),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", ".agents/orchestration/tests/**/*.test.mjs"],
    testTimeout: 20000,
    fileParallelism: false,
    env: loadEnv("", process.cwd(), ""),
  },
});
