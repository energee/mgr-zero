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
| Any code change | `.agents/ARCHITECTURE.md` — ownership map and the five iron rules |
| Setup, ports, dev login, env vars | `README.md` |
| Any customer-visible screen, action, field, option, permission, result, error, or correction flow | `content/docs/index.mdx` (Fumadocs, served at `/docs`); master chooser linking `staff-guide.mdx` and `portal-guide.mdx`; update the applicable guide with the behavior |
| Schema / migration work | `.agents/ARCHITECTURE.md` conventions, then `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md` (tables) and `2026-08-31-mgr-schema-decisions.md` (why) |
| Brewing/TTB domain rules (units, loss, removals) | `.agents/superpowers/specs/brewing-domain.md` |
| Why v1 (`~/Repos/mgr`) was left behind | `.agents/superpowers/specs/2026-08-31-mgr-v1-review.md` |
| Product intent, what a slice is | `.agents/superpowers/specs/2026-08-30-mgr-slice1-core-orders-design.md` |
| UI layout, navigation, input model (chat + forms) | `.agents/superpowers/specs/2026-08-31-mgr-ui-layout-plan.md`; screens: `components/mgr/screens.tsx` is the source of truth, viewed at `/design` (`bun run dev`); `2026-08-31-mgr-wireframes.html` is retired for MGR frames and kept only for the Slack/QuickBooks/Square venue drawings |
| Chat notifications (Slack today, provider-neutral design) | `.agents/superpowers/specs/2026-09-01-mgr-chat-notifications-design.md`; plan: `.agents/superpowers/plans/2026-09-01-chat-notifications.md` |
| What's done / next | `.agents/PROGRESS.md` |
| Past decisions and lessons | `.agents/MEMORY.md` |
| Simplifying recently modified code without behavior changes | `/simplify` — Claude Code's built-in; Pi's `.pi/prompts/simplify.md` says the same thing inline |
| HTTP API / command-docs sync | `.agents/agents/http-api.md`; in Pi `/http-api` |
| Next.js APIs | `node_modules/next/dist/docs/` (this version differs from training data) |
| Driving a browser (view the running app, reproduce a UI bug, E2E) | `.agents/skills/browse/SKILL.md` — `/browse` in Claude Code; wraps `agent-browser`, the only browser tool here (never `mcp__claude-in-chrome__*`) |

## Operating loop

1. `bunx supabase start` must be running; tests hit the real database.
2. Find the owner of the concept in `.agents/ARCHITECTURE.md` and change it there.
3. TDD: new behavior starts with a failing vitest — write it, watch it fail,
   then implement; the commit contains the test. Applies to every harness
   (Claude Code, pi, Codex, or other). Exception: UI rendering — TDD the
   logic below the component boundary; step 4 covers the eyeball check.
4. Prove it: `bun run test && bunx tsc --noEmit && bun run lint`. For UI, look
   at the rendered page — tests don't cover rendering. Use the `browse` skill
   (`.agents/skills/browse/SKILL.md`): `bunx agent-browser --session <name> open
   http://localhost:3000/...` then `snapshot` / `get text` / `screenshot`, and
   `close` the same session when done. `<name>` is the branch with `/` → `-`;
   the skill has the exact incantation and why the session matters.
5. `git diff` before committing (a stray NUL byte once made a file binary).
6. Do not edit `.agents/PROGRESS.md`, `.agents/MEMORY.md`, or `.agents/DRIFT.md`
   in a feature PR — every PR inserting at the top of the same log conflicts
   with every other. Put the one-line progress note (and any durable decision)
   in the PR description; the dreaming workflow reads merged PRs and writes the
   logs serially on its own `dreaming/main` PR.

CI (`.github/workflows/ci.yml`) runs the same checks plus `next build` on every
push; it is the merge gate.

## Authority

Do freely: edit code, edit the baseline migration in place, `supabase db reset`,
reseed, create worktrees under `.agents/worktrees/<branch>`.

Ask first: provisioning hosted Supabase or Vercel, any deploy, adding a
dependency, adding a second migration file, anything that would `DELETE`
production data (there is none yet — keep it that way by asking).

## Working files

- `.agents/MEMORY.md` — durable facts and decisions. Written by the dreaming PR from merged PR descriptions; edit directly only in a dedicated docs PR.
- `.agents/PROGRESS.md` — done / in flight / next. Same rule: state the change in the PR description, the dreaming PR writes it here.
- `.agents/DRIFT.md` — unresolved contradictions in artifacts the dreaming agent cannot edit.
- `.agents/superpowers/{specs,plans}` — design specs and plans; `docs/superpowers` is a symlink to it (the superpowers skills write there).
- `.agents/agents/` — subagent definitions; `.claude/agents` is a symlink to it (Claude Code only reads `.claude/agents`).
- `.agents/skills/` — project-local reusable workflows; `.claude/skills` is a symlink to it (Claude Code only reads `.claude/skills`); `.pi/prompts/` may provide thin Pi command aliases without duplicating skill instructions.
- `.agents/worktrees/<branch>/` — the only place for worktrees: `git worktree add .agents/worktrees/<branch> -b <branch>`. Gitignored.
- `.agents/agents/dreaming.md` — prompt for the dreaming workflow
  (`.github/workflows/dreaming.yml`) that curates the agent docs via a
  `dreaming/main` PR authored by the MGR GitHub App (`mgr[bot]`);
  merged PRs are its input; committed `.remember/today-*.md` digests, when
  present, are extra evidence.
