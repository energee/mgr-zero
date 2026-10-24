import { existsSync, readFileSync } from "node:fs";
import { resolveTestEnv } from "./scripts/test-env.mjs";
import { configDefaults, defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
// The existing screen-only proof contract, plus this harness's pure regressions.
// Every unlisted file stays in the guarded database project.
const pureTests = [
  "tests/mgr-screens.test.ts",
  "tests/tap-coverage.test.ts",
  "tests/screen-links.test.ts",
  "tests/theme-contrast.test.ts",
  "tests/screen-persona.test.ts",
  "tests/design-docs.test.ts",
  "tests/docs.test.ts",
  "tests/shell-view.test.ts",
  "tests/register-cell-keys.test.ts",
  "tests/migrations-applied.test.ts",
  "tests/test-db-schema-guard.test.ts",
  "tests/test-db-selection.test.ts",
];

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
    projects: [
      { extends: true, test: { name: "pure", include: pureTests } },
      {
        extends: true,
        test: {
          name: "database",
          include: ["tests/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...pureTests],
          globalSetup: ["tests/test-db-lock.setup.ts"],
        },
      },
    ],
    testTimeout: 20000,
    // Lock-wait tests poll pg_stat_activity until a second backend is parked;
    // under CI shard load that can take past expect.poll's 1 s default (#1245).
    expect: { poll: { timeout: 10000 } },
    fileParallelism: false,
    // Mode "test" layers .env.test.local (written by scripts/test-db.sh: the
    // throwaway stack on 5435x) over .env.local (the app stack next dev uses).
    env: resolveTestEnv(loadEnv("test", projectRoot, ""),
      existsSync(path.join(projectRoot, ".env.test.local")) ? readFileSync(path.join(projectRoot, ".env.test.local"), "utf8") : undefined),
  },
});
