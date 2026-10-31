<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MGR — agent guide

Multi-tenant brewery operations SaaS: Next.js App Router + Supabase (Postgres,
Auth, RLS). Pre-release: hosted Supabase and Vercel projects exist, but the
release is not signed off (`docs/operations/release-readiness-2026-09-18.md`).
Any deploy or hosted-infra change is ask-first (Authority below). Read this
file, then follow the routes below just in time — don't preload everything.

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
   into one compliance period module, now `lib/compliance-period.ts`.)
3. **Don't write code Haiku can't explain.** After one read, a smaller model
   should be able to say what a function or doc paragraph does and why. If
   it can't, split or rename it. For prose: one idea per sentence, one
   concept per table row. The check, run in step 5 beside `/simplify` (the
   built-in does not run it): give all changed functions to one Haiku
   subagent and ask for two sentences each on what and why. A wrong or
   hedged answer is a finding.
4. **Don't trust one search or truncated output.** Try a second pattern
   before calling code unused or missing. Read status from the exit code,
   `git status -sb`, or `gh pr checks <n>`, never from `| tail` or `| grep`.
   Read hashes, trailers, and merge state from `git` or `gh`, never from
   memory. (A truncated grep removed shadcn; `| tail` hid a failed push;
   `| grep` hid a red test run; a cited hash and a trailer claim were wrong.)
5. **Don't swallow errors or add silent fallbacks.** Let the failure reach
   the caller, or write why the fallback is safe.
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
17. **Don't chain a check with a commit or push.** Never put a test, lint, or
    grep in one command with `git commit` or `git push`; run checks as
    separate steps and gate on their exit codes. (Failing tests were pushed
    twice because a later grep in the chain succeeded.)
18. **Don't act on a PR's remembered state.** Before acting on or pushing to
    a PR, read it live: `gh pr view <n> --json state,mergedAt,headRefName`,
    and push fixes to that PR's own head branch. (#907 was treated as open
    after it merged.)
19. **Don't merge `main` into a PR by hand.** Never GitHub's "Update branch"
    or a plain merge of `main`; `scripts/land-pr.sh` does that merge and
    regenerates `supabase/migrations.lock.json`. ("Update branch" corrupted
    the lock.)
20. **Don't touch an unnamed database.** Before a backup, import, or reset,
    name the target (dev `:54342`, test `:54352`, or hosted) and confirm it
    with `docker ps` or the URL. (A test-stack database was backed up instead
    of dev.)

## Current focus: screens

Screens are the current focus. Screen, form, dialog, and entry-flow work
(and parity audits) follows `.agents/skills/screen-parity/SKILL.md`: shared views, `E` controls first,
`SCHEMA-GATE`, and the conversion rules. Lint rejects native `<select>` and
number inputs in product screens. A screen-only change (no schema, RPC, or
command touched) is proved by `bunx tsc --noEmit && bun run lint`, a look at
the rendered page (step 4), and:
`bunx vitest run tests/mgr-screens.test.ts tests/tap-coverage.test.ts tests/screen-links.test.ts tests/theme-contrast.test.ts tests/screen-persona.test.ts tests/design-docs.test.ts tests/docs.test.ts tests/api-docs.test.ts`.

## Where to look

| Task | Read first |
| --- | --- |
| Any code change | `.agents/ARCHITECTURE.md` — ownership map and the five iron rules |
| Finding where something lives (routes, commands, tables, pages, services) | `.agents/codemaps/` — `architecture`, `backend`, `frontend`, `data`, `dependencies`; paths and counts only, as of the commit in each header |
| Setup, ports, dev login, env vars | `README.md`; operator runbooks (Slack, order email, hosted config, retention, page and save latency) in `docs/operations/` |
| Any customer-visible screen, action, field, option, permission, result, error, or correction flow | `content/docs/index.mdx` (Fumadocs, served at `/docs`); master chooser linking `staff-guide.mdx` and `portal-guide.mdx`; update the applicable guide with the behavior |
| Schema / migration work | `.agents/ARCHITECTURE.md` conventions, then `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md` (tables) and `2026-08-31-mgr-schema-decisions.md` (why) |
| Brewing/TTB domain rules (units, loss, removals) | `.agents/superpowers/specs/brewing-domain.md` |
| Why v1 (`~/Repos/mgr`) was left behind | `.agents/superpowers/specs/2026-08-31-mgr-v1-review.md` |
| Product intent, what a slice is | `.agents/superpowers/specs/2026-08-30-mgr-slice1-core-orders-design.md` |
| Plan for a shipped or in-flight feature (Sells as, Square 4-packs, table sort, QuickBooks Bills, multi-role staff, Lolev orders and history, brew-day revamp, invoice payments without QuickBooks, production needs attention) | `docs/plans/<feature>.md`, one file per feature; the PR body names its plan |
| UI layout, navigation, input model (chat + forms) | `.agents/superpowers/specs/2026-08-31-mgr-ui-layout-plan.md`; screens: `components/mgr/screens.tsx` is the source of truth, viewed at `/docs/screens` (`bun run dev`); the Slack/QuickBooks/Square venue frames live in `components/mgr/venue.tsx`; the inventory publishes at `/docs/screens` (long, linkable) and `/docs/screens-explore` (filter, pick one, tap through — `lib/mgr/screen-links.ts` says where a label goes), the venue frames at `/docs/integrations`; the customer guides embed frames with `<Screen name="…" />` |
| Chat notifications (Slack today, provider-neutral design) | `.agents/superpowers/specs/2026-09-01-mgr-chat-notifications-design.md`; plan: `.agents/superpowers/plans/2026-09-01-chat-notifications.md` |
| What's done | `.agents/PROGRESS.md` (dated log) |
| What's next | `TODO.md`; in flight is the open PR list |
| Past decisions and lessons | `.agents/MEMORY.md` |
| Simplifying recently modified code without behavior changes | `/simplify` — Claude Code's built-in; Pi's `.pi/prompts/simplify.md` also runs the Haiku check (Negative 3) |
| HTTP API / command-docs sync | `.agents/agents/http-api.md` — the reference is `content/docs/api/` (an index plus one page per area), served at `/docs/api`, with each area's operations generated by `bun run docs:api` (`lib/mgr/api-operations.ts`); in Pi `/http-api` |
| Next.js APIs | `node_modules/next/dist/docs/` (this version differs from training data) |
| Driving a browser (view the running app, reproduce a UI bug, E2E) | `.agents/skills/browse/SKILL.md` — `/browse` in Claude Code; wraps `agent-browser`, the only browser tool here (never `mcp__claude-in-chrome__*`) |

## Operating loop

0. Orient first: follow `.agents/skills/orient/SKILL.md` (`/orient` in Claude
   Code) — report worktree, branch, status, PR base, then wait for confirmation.
1. `bunx supabase start` must be running for the database-backed suites and
   the dev server; those suites hit the real local database. A screen-only
   change needs only the pure files (see above).
2. Find the owner of the concept in `.agents/ARCHITECTURE.md` and change it there.
   Then design the diff `/simplify` would leave alone. Step 5 is a backstop,
   not the plan. Before the first edit, settle each of these (each one is a
   fix `/simplify` has had to make here):
   - **Reuse:** name the helper, component, query, or pattern you build on
     (Negative 2). (#764 had to switch three callers to `bblFixed` and
     `isUuid`.)
   - **Derive, don't store:** compute a value from state you already have
     instead of adding a field, prop, or flag. (Invoice-history "unpaid" was
     derived from its status.)
   - **Trust the guard:** skip a check that an upstream type, guard, or
     constraint already made. (Optional chaining after a `QueryResponse`
     guard; a NaN test after a JSON number check.)
   - **Stable dependencies:** key effects and memos on values, not on arrays
     or objects rebuilt each render. (A new roles array re-flushed the
     offline outbox on every refresh.)
   - **Leave nothing behind:** no unused export or re-export, dead branch, or
     comment that narrates the session. A test asserts behavior, not its own
     write or another test's assertion.
   If `/simplify` still finds something on your PR that this list should
   have caught, name it in the PR description, so dreaming can add it here.
3. TDD: new behavior starts with a failing vitest — write it, watch it fail,
   then implement; the commit contains the test. Applies to every harness
   (Claude Code, pi, Codex, or other). Exception: UI rendering — TDD the
   logic below the component boundary; step 4 covers the eyeball check.
4. Prove it: `bun run test && bunx tsc --noEmit && bun run lint` (screen-only:
   see above; CI runs the full suite). For UI, look at the rendered page — tests don't
   cover rendering. Use the `browse` skill
   (`.agents/skills/browse/SKILL.md`): `bunx agent-browser --session <name> open
   http://localhost:<port>/...` (the port `next dev` printed) then `snapshot` /
   `get text` / `screenshot`, and
   `close` the same session when done. `<name>` is the branch with `/` → `-`;
   the skill has the exact incantation and why the session matters.
   A test failing on a missing column or relation usually means a stale
   test schema: run `MGR_TEST_DB_RESET=1 scripts/test-db.sh` before changing
   code (without the variable it resets only when the migrations changed).
   Any edit after the proof, review fixes included, voids it; re-run before
   pushing. (A late change pushed a red pure test.)
5. Run `/simplify` on every code change before committing (see the tool
   table), then re-run step 4's checks: simplify passes have broken tests.
   Then give only the simplify diff to one read-only agent and ask what
   behavior it changed (identity, caching, loops, dropped data); fix any
   answer that is not "none". (Simplify passes introduced an infinite loop, a
   cache miss, and dropped offline data.) Then `git diff`: a stray NUL byte
   once made a file binary.
6. Do not edit `.agents/PROGRESS.md`, `.agents/MEMORY.md`, or `.agents/DRIFT.md`
   in a feature PR — every PR inserting at the top of the same log conflicts
   with every other. Put the one-line progress note (and any durable decision)
   in the PR description; the dreaming workflow reads merged PRs and writes the
   logs serially on its own `dreaming/main` PR. Three lines in the description
   are read by scripts, not the model (`scripts/pr-directives.ts`): `TODO:
   <text>` names the open `TODO.md` item this PR finishes, and CI rejects one
   that does not match exactly one item; the literal `DOCS: none` skips the
   documentation agent, and `API: none` skips the HTTP API agent.
   `.github/pull_request_template.md` prompts for all three, plus a
   `Closes #<n>` line so a finished issue closes on merge. Both doc agents
   also re-audit weekly, and `.github/workflows/doc-agent-watch.yml` opens an
   issue when any doc workflow or `hosted jobs` fails, or no dream lands for
   3 days.

CI (`.github/workflows/ci.yml`) runs the same checks plus `next build` on every
push; it is the merge gate.

## Authority

Do freely: edit code, `supabase db reset` on the app stack, reseed, create worktrees under
`.agents/worktrees/<branch>`.

Never edit a committed migration. `supabase db push` applies a version once and
never reads that file again, so an edit reaches CI — which builds a database
from scratch — and never reaches hosted. That is what broke `/settings`, `/menu`
and Ask MGR on live (#329, #330). A schema change is a new migration file.
`supabase/migrations.lock.json` pins every file's hash for
`tests/migrations-applied.test.ts`. After adding a migration, run
`bun run migrations:lock`; it preserves pins from trusted `origin/main`
merge-base history, re-hashes branch-only files, and drops removed branch-only
pins. Fetch main's history first; generation fails if that history is unavailable.
CI and `scripts/land-pr.sh` run `scripts/check-migration-order.ts` against a
trusted main ref. That guard rejects edits, renames, deletions, and changed or
missing existing lock entries independently of the checkout's hashes. A new
migration's timestamp must be later than every migration on main:
`supabase db push` refuses an older one, and the same guard rejects it.

Ask first: provisioning hosted Supabase or Vercel, any deploy, adding a
dependency, anything that would `DELETE` production data (there is none yet —
keep it that way by asking).

Do not move, rename, or delete files outside the explicit scope of the
request. If a restructure seems necessary, list the proposed moves and wait for
approval before touching anything.

## Working files

- `scripts/worktree.sh <branch> [base]` creates `.agents/worktrees/<branch>/`, the only place for worktrees; plain `git worktree add` cannot run `vitest` or `next dev`.
- `scripts/land-pr.sh <pr> [--merge]` lands one PR: merges origin/main, regenerates the migration lock and API docs, proves, pushes, waits for CI, and merges only after `claude-code-review.yml` ran: its `simplify` job (Claude Code's `/simplify`, pushing fixes to the branch) and its `claude-review` job both succeeded in one run. It marks a draft ready so that runs, and waits for it before syncing. One session merges at a time.
- `.claude/settings.json` is the shared allowlist: exact proof commands and plain `git fetch` only. Never add interpreters, shells, `bun run *`, pushes, other writes, or a trailing `*` on a command whose flags can run code.
- `.agents/MEMORY.md`, `.agents/PROGRESS.md`, `.agents/DRIFT.md` are written by the dreaming PR (operating loop step 6). The full list of agent files is in `.agents/ARCHITECTURE.md` "Working files".
