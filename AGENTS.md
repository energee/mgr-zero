<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agent working files

- `.agents/MEMORY.md` — durable facts and decisions. Read it first; update it when a decision changes.
- `.agents/PROGRESS.md` — what's done / in flight / next. Update at the end of each work session.
- `.agents/worktrees/<branch>/` — the only place for git worktrees: `git worktree add .agents/worktrees/<branch> -b <branch>`. Gitignored.

# Planning

- Plans live in `docs/superpowers/plans/`, specs in `docs/superpowers/specs/`. No other location.
- One plan ↔ one branch ↔ one worktree, same name: `plans/<date>-<name>.md` → branch `<name>` → `.agents/worktrees/<name>`.
- Claim before planning: add a line under `## Now` in `.agents/PROGRESS.md` with the plan path and branch. If the area is already listed, join that plan — don't write a second one. `git worktree list` is the backup check.
- Every plan starts with `status: draft | approved | in-progress | done`. Move its PROGRESS line to `## Done` when done.
- Plans cite `.agents/MEMORY.md` and the schema decisions doc; they don't re-decide them. If two plans touch the same table, the second edits the first plan's schema section.
