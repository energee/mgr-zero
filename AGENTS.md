<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MGR — agent guide

Multi-tenant brewery operations SaaS: Next.js App Router + Supabase (Postgres,
Auth, RLS). Nothing is deployed yet. Read this file, then follow the routes
below just in time — don't preload everything.

## Where to look

| Task | Read first |
| --- | --- |
| Any code change | `ARCHITECTURE.md` — ownership map and the five iron rules |
| Setup, ports, dev login, env vars | `README.md` |
| Schema / migration work | `ARCHITECTURE.md` conventions, then `docs/superpowers/specs/2026-08-31-mgr-schema-decisions.md` |
| Brewing/TTB domain rules (units, loss, removals) | `docs/superpowers/specs/brewing-domain.md` |
| Why v1 (`~/Repos/mgr`) was left behind | `docs/superpowers/specs/2026-08-31-mgr-v1-review.md` |
| Product intent, what a slice is | `docs/superpowers/specs/2026-08-30-mgr-slice1-core-orders-design.md` |
| What's done / next | `.agents/PROGRESS.md` |
| Past decisions and lessons | `.agents/MEMORY.md` |
| Next.js APIs | `node_modules/next/dist/docs/` (this version differs from training data) |

## Operating loop

1. `npx supabase start` must be running; tests hit the real database.
2. Find the owner of the concept in `ARCHITECTURE.md` and change it there.
3. Prove it: `npx vitest run && npx tsc --noEmit && npm run lint`. For UI, look
   at the rendered page — tests don't cover rendering.
4. `git diff` before committing (a stray NUL byte once made a file binary).
5. Update `.agents/PROGRESS.md`; update `.agents/MEMORY.md` only if a durable
   decision changed.

CI (`.github/workflows/ci.yml`) runs the same checks plus `next build` on every
push; it is the merge gate.

## Authority

Do freely: edit code, edit the baseline migration in place, `supabase db reset`,
reseed, create worktrees under `.agents/worktrees/<branch>`.

Ask first: provisioning hosted Supabase or Vercel, any deploy, adding a
dependency, adding a second migration file, anything that would `DELETE`
production data (there is none yet — keep it that way by asking).

## Working files

- `.agents/MEMORY.md` — durable facts and decisions. Update when a decision changes.
- `.agents/PROGRESS.md` — done / in flight / next. Update at the end of each session.
- `.agents/worktrees/<branch>/` — the only place for worktrees: `git worktree add .agents/worktrees/<branch> -b <branch>`. Gitignored.
