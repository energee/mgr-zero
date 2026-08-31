// playwright.config.ts — local-only E2E smoke config (npm run test:e2e).
// Not run in CI (.github/workflows/ci.yml is unchanged); requires
// `npx supabase start` and a `.env.local` already in place, same as the
// vitest suite. Starts `next dev` itself unless one is already running on
// :3000, and reuses it either way.
import { defineConfig } from "@playwright/test";
import { loadEnv } from "vite";

// Playwright doesn't read .env.local itself (unlike Next.js/Vite); reuse the
// same loader vitest.config.ts uses so tests-e2e's seeding via
// tests/helpers.ts sees NEXT_PUBLIC_SUPABASE_URL etc.
Object.assign(process.env, loadEnv("", process.cwd(), ""));

// Runs its own dev server on 3100 rather than the default 3000: this
// worktree is one of several checked out from the same repo, and reusing
// whatever's already on 3000 risks hitting a different worktree's `next
// dev` (different branch, same port) instead of this branch's code.
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests-e2e",
  timeout: 30000,
  fullyParallel: false,
  use: {
    baseURL,
  },
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
