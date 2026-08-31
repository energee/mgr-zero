# MEMORY

Durable facts and decisions for agents working on mgr. Update when a decision is made; delete when it stops being true. Not a changelog — see PROGRESS.md.

## Project
- mgr (github.com/energee/mgr-zero): multi-brewery operations SaaS. Next.js App Router + Supabase.
- Nothing is deployed. No hosted Supabase or Vercel project exists; deployment needs Ted's go-ahead.
- Local Supabase uses offset ports (API 54341) from committed `supabase/config.toml`.
- Dev login: `dev@mgr.local` / `dev-password-1`, seeded via `npx tsx --env-file=.env.local scripts/seed-dev.ts`.

## Decisions
- One baseline migration covering all ten slices (~55 tables) instead of accumulating migrations. Pre-deploy, the baseline is edited in place. Details: `docs/superpowers/specs/2026-08-31-mgr-schema-decisions.md`.
- Product spec: `docs/superpowers/specs/2026-08-30-mgr-slice1-core-orders-design.md`.
- Schema conventions: `brewery_id` + RLS on every table, composite tenant FKs, append-only ledgers, triggers for derived values, no unmaintained status columns ("if it won't be accurate I don't want it").

## Process
- All worktrees live in `.agents/worktrees/<branch>` (gitignored). Create with `git worktree add .agents/worktrees/<branch> -b <branch>`.
- Reviewers that verify by execution (writing to the live DB) find real bugs; read-only reviews find style.
- Visually check rendered UI before calling UI work done (a serif-font regression went unnoticed).
- Diff before committing — a stray NUL byte once made a file binary.
- Run `tsc --noEmit` and `vitest run` before every commit.
