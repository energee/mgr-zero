# E2E runners

The two local browser runners outside vitest: the mobile command-surface regression and the `bun run test:e2e` portal smoke.

`bun tests-e2e/mobile-command-surface.ts [screenshot-directory]` checks Reading and Count actions, Count's Location Select, and minimized-composer Tabs. It starts its own server on an available port; stop this worktree's dev server first because Next permits only one `.next/dev` owner. It never stops an existing server or seeds data. A leftover lock from a crashed server is also refused; inspect it yourself rather than having the runner delete an unknown lock. The 390×500 viewport is a short-viewport proxy, not proof of a real phone soft keyboard.

`bun run test:e2e` drives the browser with `agent-browser` (Vercel's browser
automation CLI) instead of Playwright. It runs agent-browser's bundled Chrome
by default; `E2E_ENGINES=lightpanda,chrome` re-enables the engine-fallback
chain (each engine gets freshly seeded data; the script prints which engine
passed). Lightpanda renders the app but is currently blocked by
engine/adapter gaps: Lightpanda currently cannot drive React controlled inputs (checked 2026-08-31); retest after
`brew upgrade lightpanda` or an agent-browser release. The script starts its own `next dev` on port
3100 (not 3000, so it never collides with another worktree's dev server on
the same repo), reusing one already running there, and stops what it
started on both success and failure. It needs `bunx supabase start` and a
`.env.local` in place, same as the vitest suite. See `tests-e2e/portal-smoke.ts`.
