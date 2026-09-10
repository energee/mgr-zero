<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MGR — agent guide

Multi-tenant brewery operations SaaS: Next.js App Router + Supabase (Postgres,
Auth, RLS). Nothing is deployed yet. Read this file, then follow the routes
below just in time — don't preload everything.

## Current focus: screens

For screen, form, dialog, and entry-flow changes or parity audits, use
`.agents/skills/screen-parity/SKILL.md`. Inventory and live application must
share the same views, controls, and surface wrappers; fixtures versus
database-backed data/actions are the boundary. The screen explorer is the
interface source of truth. Validate this in code.

Decided 2026-09-06. `components/mgr/screens.tsx` and the pages that render it
are the work. Schema, migrations, RPCs, and the database-backed test suites
wait for the backend push; when that starts, tests get their own throwaway
database (as CI already has) and stop touching the dev one.

- Don't start database work, test-database isolation, or migrations
  unprompted. If a screen change seems to need one, say so in a line and
  draw the screen gated (`SCHEMA-GATE` in `writes`), as the inventory already does.
- Proof for screen work is `bunx tsc --noEmit && bun run lint`, the pure
  vitest files (`bunx vitest run tests/mgr-screens.test.ts tests/tap-coverage.test.ts
  tests/screen-links.test.ts tests/theme-contrast.test.ts tests/screen-persona.test.ts
  tests/design-docs.test.ts tests/docs.test.ts` covers the inventory),
  and looking at the rendered page (step 4). Leave the database-backed suites
  to CI, which runs them on a fresh database.
- If `tests/chat-jobs.test.ts` times out locally, that is the shared dev
  database, not your change: its `runChatScan` walks every brewery with an
  active `chat_installations` row, and every past run left a fake one behind.
  `update chat_installations set state = 'disconnected' where state = 'active'`
  clears it (no seed creates installations, so every active row is a leftover).
- Conversion must not invent a SKU, ATP, unit, or barrel volume the command
  did not return.
- Conversion must not default `backHref` (or other live paths) on fixture
  adapters; inventory `E.back`/`E.act` stay `"#"` unless the caller passed href.
- Conversion must not drop live verbs (Pick vs Open, Reorder on detail, Question
  on every invoice state) or suppress `question` / `footer={null}` slots.
- Conversion must not ship a customer-visible field or verb without updating
  `content/docs/staff-guide.mdx` and/or `portal-guide.mdx`.

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
| UI layout, navigation, input model (chat + forms) | `.agents/superpowers/specs/2026-08-31-mgr-ui-layout-plan.md`; screens: `components/mgr/screens.tsx` is the source of truth, viewed at `/docs/screens` (`bun run dev`); the old `/design` gallery and the HTML wireframe are both deleted — the Slack/QuickBooks/Square venue frames are ported too (`components/mgr/venue.tsx`); the inventory publishes at `/docs/screens` (long, linkable) and `/docs/screens-explore` (filter, pick one, tap through — `lib/mgr/screen-links.ts` says where a label goes), the venue frames at `/docs/integrations`; the customer guides embed frames with `<Screen name="…" />` |
| Chat notifications (Slack today, provider-neutral design) | `.agents/superpowers/specs/2026-09-01-mgr-chat-notifications-design.md`; plan: `.agents/superpowers/plans/2026-09-01-chat-notifications.md` |
| What's done / next | `.agents/PROGRESS.md` |
| Past decisions and lessons | `.agents/MEMORY.md` |
| Simplifying recently modified code without behavior changes | `/simplify` — Claude Code's built-in; Pi's `.pi/prompts/simplify.md` says the same thing inline |
| HTTP API / command-docs sync | `.agents/agents/http-api.md` — the reference is `content/docs/api.mdx`, served at `/docs/api`, with each area's operations generated by `bun run docs:api` (`lib/mgr/api-operations.ts`); in Pi `/http-api` |
| Next.js APIs | `node_modules/next/dist/docs/` (this version differs from training data) |
| Driving a browser (view the running app, reproduce a UI bug, E2E) | `.agents/skills/browse/SKILL.md` — `/browse` in Claude Code; wraps `agent-browser`, the only browser tool here (never `mcp__claude-in-chrome__*`) |

## Operating loop

0. Orient first: follow `.agents/skills/orient/SKILL.md` (`/orient` in Claude
   Code) — report worktree, branch, status, PR base, then wait for confirmation.
1. `bunx supabase start` must be running for the database-backed suites and
   the dev server; those suites hit the real local database. Screen work
   under the current focus needs only the pure files listed above.
2. Find the owner of the concept in `.agents/ARCHITECTURE.md` and change it there.
3. TDD: new behavior starts with a failing vitest — write it, watch it fail,
   then implement; the commit contains the test. Applies to every harness
   (Claude Code, pi, Codex, or other). Exception: UI rendering — TDD the
   logic below the component boundary; step 4 covers the eyeball check.
4. Prove it: `bun run test && bunx tsc --noEmit && bun run lint` (under the
   current focus, the pure vitest files stand in for `bun run test` locally;
   CI runs the full suite). For UI, look at the rendered page — tests don't
   cover rendering. Use the `browse` skill
   (`.agents/skills/browse/SKILL.md`): `bunx agent-browser --session <name> open
   http://localhost:3000/...` then `snapshot` / `get text` / `screenshot`, and
   `close` the same session when done. `<name>` is the branch with `/` → `-`;
   the skill has the exact incantation and why the session matters.
5. `git diff` before committing (a stray NUL byte once made a file binary).
6. Do not edit `.agents/PROGRESS.md`, `.agents/MEMORY.md`, or `.agents/DRIFT.md`
   in a feature PR — every PR inserting at the top of the same log conflicts
   with every other. Put the one-line progress note (and any durable decision)
   in the PR description; the dreaming workflow reads merged PRs and writes the
   logs serially on its own `dreaming/main` PR. Two lines in the description
   are read by scripts, not the model (`scripts/pr-directives.ts`): `TODO:
   <text>` names the open `TODO.md` item this PR finishes, and CI rejects one
   that does not match exactly one item; the literal `DOCS: none` skips the
   documentation agent.

CI (`.github/workflows/ci.yml`) runs the same checks plus `next build` on every
push; it is the merge gate.

## Authority

Do freely: edit code, edit the baseline migration in place, `supabase db reset`,
reseed, create worktrees under `.agents/worktrees/<branch>`.

Ask first: provisioning hosted Supabase or Vercel, any deploy, adding a
dependency, adding a second migration file, anything that would `DELETE`
production data (there is none yet — keep it that way by asking).

Do not move, rename, or delete files outside the explicit scope of the
request. If a restructure seems necessary, list the proposed moves and wait for
approval before touching anything.

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
