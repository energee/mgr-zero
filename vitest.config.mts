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
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    fileParallelism: false,
    // Mode "test" layers .env.test.local (written by scripts/test-db.sh: the
    // throwaway stack on 5435x) over .env.local (the app stack next dev uses).
    env: loadEnv("test", process.cwd(), ""),
  },
});
