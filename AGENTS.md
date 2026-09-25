<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MGR — agent guide

Multi-tenant brewery operations SaaS: Next.js App Router + Supabase (Postgres,
Auth, RLS). Pre-release: hosted Supabase and Vercel projects exist, but the
release is not signed off (owner Ted, tracks #311; see
`docs/operations/release-readiness-2026-09-18.md`) — treat any deploy or
hosted-infra change as ask-first per Authority below. Read this file, then
follow the routes below just in time — don't preload everything.

## Negatives (ranked; an earlier one wins a conflict)

Each one has cost a revert or a rework here before.

1. **Don't over-engineer.** No abstraction with one caller, no option or
   config nobody asked for, no modeling of cases the request did not name.
   Ship the simple version and ask about the rest. (An over-modeled
   price-group design and a label plan had to be cut back.)
2. **Don't reinvent.** Before writing a helper, component, query, table,
   trigger, or validator, search for one that exists (`lib/mgr`,
   `components/mgr/e.tsx`, `supabase/migrations`) and say what you found.
   A second copy is a defect. (The POS tables were already in the baseline;
   #482 merged four copies of one helper; #484 moved a copied `monthOver`
   into `period.ts`.)
3. **Don't write code Haiku can't explain.** After one read, a smaller model
   should be able to say what a function or doc paragraph does and why. If
   it can't, split or rename it. For prose: one idea per sentence, one
   concept per table row. The check, run by `/simplify`: give all changed
   functions to one Haiku subagent and ask for two sentences each on what
   and why. A wrong or hedged answer is a finding.
4. **Don't trust one search or truncated output.** Try a second pattern
   before calling code unused or missing. Read status from the exit code,
   `git status -sb`, or `gh pr checks <n>`, never from `| tail` or `| grep`.
   Read hashes, trailers, and merge state from `git` or `gh`, never from
   memory. (A truncated grep removed shadcn; `| tail` hid a failed push;
   `| grep` hid a red test run; a cited hash and a trailer claim were wrong.)
5. **Don't swallow errors or add silent fallbacks.** Let the failure reach
   the caller, or write why the fallback is safe. (#408 had to surface them.)
6. **Don't expand scope.** No drive-by refactors; moves and renames follow
   Authority below.
7. **Don't edit YAML, JSON, SQL, or TSX with `sed`.** Use an editor tool or
   a script, and parse-check YAML before committing. (A `sed` edit dropped a
   workflow key; a column-0 line made YAML invalid.)
8. **Don't act on an assumed target.** Orient first (Operating loop step 0),
   and name the diff range (`origin/main..HEAD`) before a review.
9. **Don't file an issue unsearched.** Run
   `gh issue list --state all --search "<keywords>"` first and report
   duplicates.
10. **Don't merge until checks are green.** (A view without
    `security_invoker` merged red and broke main.)
11. **Don't leave review findings open.** Fix every one, or give a reason for
    each you skip.
12. **Don't filter in the page.** Put the predicate in the query; see the
    pre-implementation gates in `.agents/ARCHITECTURE.md`.
13. **Don't relay a subagent's claim unchecked.** Confirm its commits with
    `git log` and its files with `git status` before reporting. Reviews use
    read-only agents. (A subagent claimed commits that did not exist; a
    "read-only" reviewer left test files behind.)
14. **Don't use a bare `git stash`.** The stash is shared by every worktree;
    make a WIP commit instead. (Parallel agents swapped changes through it.)
15. **Don't guess between two readings.** If a request reads two ways,
    restate it in one line first. A request to explain gets an explanation,
    not a code change.
16. **Don't stack PRs unasked.** Base every PR on `main`. (A PR based on
    another branch merged into that branch instead of `main`.)

## Current focus: screens

For screen, form, dialog, and entry-flow changes or parity audits, use
`.agents/skills/screen-parity/SKILL.md`. Inventory and live application must
share the same views, controls, and surface wrappers; fixtures versus
database-backed data/actions are the boundary. The screen explorer is the
interface source of truth. Validate this in code.

### UI controls: reuse E first

Before creating or changing an interface, read `components/mgr/e.tsx` and reuse
its controls inside the shared view: `E.pick` for selects, `E.edit` for fields
(including the numeric stepper), `E.sw` for on/off settings, and `E.volume`
for beer volume. Use existing E layouts and actions too. If a control needs
controlled state or a missing option, extend the shared primitive rather than
drawing a local replacement. Preserve labels, bounds, required/disabled state,
and callbacks.

Do not add native `<select>`, standalone `<input type="number">`, or
`<Input type="number">` to product screens. Lint rejects these. Numeric inputs
belong only inside the shared quantity implementation, where native spinners
are hidden. The Slack venue replica has a documented native-select exception;
it is not a pattern for MGR interfaces. Do not suppress the rule for new forms.

Decided 2026-09-06; the backend push landed 2026-09-08 (Programs 0–10 of
`.agents/superpowers/plans/2026-09-07-backend-database-integration.md`, PRs
#185–#209) and continued through the adversarial-walkthrough remediation wave
(PRs #480–#600). `components/mgr/screens.tsx` and the pages that render it
are still the entry point for interface work, but schema, migrations, RPCs,
and the database-backed test suites are normal work now, not gated: the
throwaway `mgr_test` stack (`scripts/test-db.sh`, a portable lock lets
parallel sessions share it safely) is the default per Operating loop step 1.

- A screen still marked `SCHEMA-GATE` in its `writes` is blocked on a named
  product/schema decision, not on the backend push — say what's missing and
  leave it gated rather than resolving the decision inline. Only one screen
  is gated today: the taproom role's per-role RLS (spec §16.13/§16.16 q3).
- Proof for a screen-only change (no schema/RPC touched) may use
  `bunx tsc --noEmit && bun run lint` plus the pure vitest files
  (`bunx vitest run tests/mgr-screens.test.ts tests/tap-coverage.test.ts
  tests/screen-links.test.ts tests/theme-contrast.test.ts tests/screen-persona.test.ts
  tests/design-docs.test.ts tests/docs.test.ts` covers the inventory) and
  looking at the rendered page (step 4); any change touching schema, RPCs, or
  commands runs the full Operating loop step 4 proof instead.
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
| HTTP API / command-docs sync | `.agents/agents/http-api.md` — the reference is `content/docs/api/` (an index plus one page per area), served at `/docs/api`, with each area's operations generated by `bun run docs:api` (`lib/mgr/api-operations.ts`); in Pi `/http-api` |
| Next.js APIs | `node_modules/next/dist/docs/` (this version differs from training data) |
| Driving a browser (view the running app, reproduce a UI bug, E2E) | `.agents/skills/browse/SKILL.md` — `/browse` in Claude Code; wraps `agent-browser`, the only browser tool here (never `mcp__claude-in-chrome__*`) |

## Operating loop

0. Orient first: follow `.agents/skills/orient/SKILL.md` (`/orient` in Claude
   Code) — report worktree, branch, status, PR base, then wait for confirmation.
1. `bunx supabase start` must be running for the database-backed suites and
   the dev server; those suites hit the real local database. A screen-only
   change (no schema/RPC/command touched) needs only the pure files listed
   above.
2. Find the owner of the concept in `.agents/ARCHITECTURE.md` and change it there.
3. TDD: new behavior starts with a failing vitest — write it, watch it fail,
   then implement; the commit contains the test. Applies to every harness
   (Claude Code, pi, Codex, or other). Exception: UI rendering — TDD the
   logic below the component boundary; step 4 covers the eyeball check.
4. Prove it: `bun run test && bunx tsc --noEmit && bun run lint` (for a
   screen-only change, the pure vitest files stand in for `bun run test`
   locally; CI runs the full suite). For UI, look at the rendered page — tests don't
   cover rendering. Use the `browse` skill
   (`.agents/skills/browse/SKILL.md`): `bunx agent-browser --session <name> open
   http://localhost:3000/...` then `snapshot` / `get text` / `screenshot`, and
   `close` the same session when done. `<name>` is the branch with `/` → `-`;
   the skill has the exact incantation and why the session matters.
   A test failing on a missing column or relation usually means a stale
   test schema: run `MGR_TEST_DB_RESET=1 scripts/test-db.sh` before changing
   code (without the variable it resets only when the migrations changed).
5. Run `/simplify` on every code change before committing (see the tool
   table), then re-run step 4's checks: simplify passes have broken tests.
   Then `git diff`: a stray NUL byte once made a file binary.
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

Do freely: edit code, `supabase db reset` on the app stack, reseed, create worktrees under
`.agents/worktrees/<branch>`.

Never edit a committed migration. `supabase db push` applies a version once and
never reads that file again, so an edit reaches CI — which builds a database
from scratch — and never reaches hosted. That is what broke `/settings`, `/menu`
and Ask MGR on live (#329, #330). A schema change is a new migration file, and
`supabase/migrations.lock.json` pins every file's hash so an edit fails
`tests/migrations-applied.test.ts`. After adding a migration, run
`bun run migrations:lock`. (Before #285 the baseline was edited in place; that
window closed the day it was first pushed.)

Ask first: provisioning hosted Supabase or Vercel, any deploy, adding a
dependency, anything that would `DELETE` production data (there is none yet —
keep it that way by asking).

Do not move, rename, or delete files outside the explicit scope of the
request. If a restructure seems necessary, list the proposed moves and wait for
approval before touching anything.

## Working files

- `.agents/MEMORY.md` — durable facts and decisions. Written by the dreaming PR from merged PR descriptions; edit directly only in a dedicated docs PR.
- `.agents/PROGRESS.md` — done / in flight / next. Same rule: state the change in the PR description, the dreaming PR writes it here.
- `.agents/DRIFT.md` — unresolved contradictions in artifacts the dreaming agent cannot edit.
- `.agents/superpowers/{specs,plans}` — design specs and plans; `docs/superpowers` is a symlink to it (the superpowers skills write there).
- `.agents/agents/` — subagent definitions; `.claude/agents` is a symlink to it (Claude Code only reads `.claude/agents`).
- `.claude/settings.json` — shared Claude Code allowlist: the proof checks and plain `git fetch`, in exact forms. Never add interpreters, shells, `bun run *`, pushes, other writes, or a trailing `*` on a command whose flags can run code (`git fetch --upload-pack`, `vitest --config`).
- `.agents/skills/` — project-local reusable workflows; `.claude/skills` is a symlink to it (Claude Code only reads `.claude/skills`); `.pi/prompts/` may provide thin Pi command aliases without duplicating skill instructions.
- `.agents/worktrees/<branch>/` — the only place for worktrees: `scripts/worktree.sh <branch> [base]` creates one, symlinks the gitignored `.env.local`/`.env.test.local` from the main checkout, and runs `bun install` (Turbopack rejects a node_modules symlink, so each worktree owns its own). Plain `git worktree add` leaves a checkout that cannot run `vitest` or `next dev`. Gitignored.
- `scripts/land-pr.sh <pr> [--merge]` — lands one PR from its worktree: merges origin/main (resolving only a `migrations.lock.json` conflict), regenerates the lock and API docs, runs the local proof (tsc, lint, the PR's tests plus every test naming a SQL function its migrations define), pushes, waits for CI and reruns Docker/port infra failures, then merges. Chain calls in migration-timestamp order for a queue; one session merges at a time. Exit codes are listed in its header.
- `.agents/agents/dreaming.md` — prompt for the dreaming workflow
  (`.github/workflows/dreaming.yml`) that curates the agent docs via a
  `dreaming/main` PR authored by the MGR GitHub App (`mgr[bot]`);
  merged PRs are its input; committed `.remember/today-*.md` digests, when
  present, are extra evidence.
