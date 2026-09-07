import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "."),
      // Resolved, not a relative path: a worktree's node_modules is empty and
      // Bun walks up to the main checkout's.
      "server-only": createRequire(import.meta.url).resolve("next/dist/compiled/server-only/empty.js"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    fileParallelism: false,
    // Mode "test" layers .env.test.local (written by scripts/test-db.sh: the
    // throwaway stack on 5435x) over .env.local (the app stack next dev uses).
    env: loadEnv("test", process.cwd(), ""),
  },
});
