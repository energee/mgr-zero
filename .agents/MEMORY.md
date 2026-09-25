# MEMORY

Durable facts and decisions for agents working on mgr. Update when a decision is made; delete when it stops being true. Not a changelog — see PROGRESS.md.

## Project
- mgr (github.com/energee/mgr-zero): multi-brewery operations SaaS. Next.js App Router + Supabase.
- Not in production. Hosted Supabase (`uogrvqmrbmolvtftotsf`, production) and Vercel projects exist and have been used for pre-release evidence gathering; a second Supabase project (`ugzhwxzictzvrzlacjmv`) is the decided Preview target. Public sign-up is disabled on production (#467, 2026-09-25): staff arrive only by invitation. Release is not signed off — owner Ted, tracks #311, current record is `docs/operations/release-readiness-2026-09-18.md` (decided 2026-09-18: pilot scope is J01 ordering/J02 picked-order adjustment/J06 recovery; Auth SMTP via Resend, parked on a sending domain; the 171 authenticated-executable-RPC advisor is accepted as designed). Any further hosted/deploy action is still ask-first (`AGENTS.md` Authority).
- Setup, ports, dev login: `README.md`. Ownership + iron rules: `.agents/ARCHITECTURE.md`.

## Decisions
- **2026-09-02 — Bun is the package manager.** Installs and scripts go through Bun (`bun install`, `bun run`, `bunx`); Node 22 remains the Next.js runtime. The committed lockfile is `bun.lock` only.
- **`components/mgr/screens.tsx` is the source of truth for MGR screens** (2026-09-02; built from UI plan rev 4). `2026-08-31-mgr-wireframes.html` was ported into typed records by 2026-09-03 (PR #69, last 17 Slack/QuickBooks/Square venue frames into `components/mgr/venue.tsx`); the file itself, and the dev-only `/design` gallery it fed, were deleted 2026-09-04 (PR #133) — `/docs/screens` is now the sole design-review surface. Change navigation/flows and the `SCREENS` array together — the record count is not sacred, a real operator job gets a real body, never an annotation chip. The records publish read-only at `/docs/screens` (MGR frames, long linkable index), `/docs/screens-explore` (filterable, tappable walkthrough over the same records — a role-scoped persona switch, sheets portal inline, browser back retraces taps; `tests/tap-coverage.test.ts` fails if any tap in any screen resolves nowhere; PR #136, refactored PR #139) and `/docs/integrations` (the venue frames, grouped by product); all embed the one public `app/(frames)/screens/frame/[s]` route (the explorer draws screens inline in their own shell instead) — a generated page, deliberately outside the documentation agent's allowlist (`tests/design-docs.test.ts`). Staff uses Today/Beer/Work/More; the wholesale portal has its own Order/Orders/Invoices/Account shell. Frames draw only user-visible UI — the annotation, gate-copy, and Today-exemplar rules live in the plan preamble and §5, not here. Edit the typed records directly, never regenerate.
- **MGR screen controls, established across the design pass (2026-09-03, PRs #89–#127):** one primary (filled) action per screen, other verbs outline/ghost; quantities and dates use native inputs (`E.qty`, native date) rather than an on-screen keypad; a field a user can change renders a real shadcn `Input`/`Select`/`Switch`, never a chip standing in for a field; `E.tabs` is for view switchers, chips stay for filters and single-choice fields; the shell and its grids use the real desktop width (`md:max-w-5xl`, responsive `E.btns`/`E.tiles`) rather than a phone-width column stretched wide.
- **Accent colors carry semantic status/action roles (2026-09-06, PR #156):** the six-accent palette is fixed to meanings, not chosen per screen — confirm green, put-back/assign orange, pick/count/resume cyan, general actions purple, destructive red/pink — with AA-checked light/dark tokens; color supplements the label/icon, it never stands alone. Sign out is classed destructive (red), not the teal accent for "irreversible actions that still write a record" (PR #155); `app/globals.css`'s token comment is the single statement of which accent means what — update it in the same change that reclassifies a control.
- **Migrations accumulate; a committed one is never edited again (2026-09-13, PRs #285, #337 — supersedes the earlier "baseline edited in place" practice).** `supabase db push` applies a migration version once and never rereads that file, so two migrations kept being hand-edited after hosted had already applied them (`00001_baseline.sql` through #320/#326, then a second file through #303–#319) and the edits never reached hosted — `/settings`, `/menu`, and Ask MGR broke on live (#329, #330). Fix: both applied files were restored to exactly what hosted ran, everything edited into them since became one catch-up migration, and `supabase/migrations.lock.json` + `tests/migrations-applied.test.ts` now fail the build the moment a committed migration's hash changes. A schema change is always a new migration file, then `bun run migrations:lock`. Details: `.agents/superpowers/specs/2026-08-31-mgr-schema-decisions.md` (pre-#285 baseline design).
- **The backend push landed 2026-09-08 (Programs 0–10, PRs #185–#209), then continued hardening through an adversarial-walkthrough remediation wave (PRs #480–#600).** Schema, RPCs, and the full command surface exist for all ten programs (ordering, locations/bins/stock-transfers, catalog identity, sale channels, production/packaging/cellar, purchasing, taproom kegs, delivery routes, compliance/lot-trace, explorer-parity landings). `components/mgr/screens.tsx` is no longer screens-only work — database/RPC work is normal, gated per-screen only where `writes` still says `SCHEMA-GATE` (`TODO.md` keeps the current count). Durable rulings from those programs: gravity is stored in °Plato only with a per-user/brewery display-unit preference, resolved server-side, never stored computed (Program 5); a hop contract's lead time is an observed vendor view, never stored, and PO transport (`sent_via`) is a property, not a `po_status` fork (Program 6, confirms the PR #173 design); a keg event naming a customer only ever means shipped/lost-at-customer, never `found` (Program 7); a departed delivery route is frozen — no stop can change and the route can't return with one open (Program 8); a movement's tax treatment is resolved and frozen at insert, never recomputed at report time, so editing a channel or customer later never restates a filed month (Program 9); global search is parallel per-entity RLS-bound reads, not a definer SQL function, because RLS already decides the rows (Program 10). Lot identity at pick/ship (a sale removal names no lot) stays an open gap, not yet scheduled.
- Product spec: `.agents/superpowers/specs/2026-08-30-mgr-slice1-core-orders-design.md`.
- Schema revision 2 (2026-09-02, §16 of the design doc — held as a spec, not migrated): `products` → `brands`, and a batch's identity becomes `intended_brand_id`, nullable, because identity is optional at brew and already enforced at packaging by `lots.brand_id NOT NULL`. `formats` own `bbl_per_unit`; SKUs stop carrying it.
- Taproom inventory: **the physical count posts depletion; POS is the variance check** (2026-09-02, §16.15). This inverts the rule drawn in the POS wireframes, which need amending. Tapping and kicking a keg have no ledger effect at all — POS yields *expected* consumption, the count yields *actual*, and the gap is the report a taproom manager acts on.
- Schema conventions live in `.agents/ARCHITECTURE.md`; the quote behind "no status columns" is Ted's: "if it won't be accurate I don't want it".
- Every merged PR gets a full customer-documentation pass, with `workflow_dispatch` on `main` as the recovery path. Claude has read-only GitHub permissions and may edit only the master, staff, and portal guide MDX files; a separate deterministic job rejects any wider or active-content diff and maintains one reviewable `documentation/user-guide` PR. The agent never commits directly to `main`. The publish step mints the MGR App token (same as `dreaming.yml`) rather than `github.token`, so the resulting push triggers `ci.yml` (PR #49).
- `content/docs/index.mdx` is the documentation master (Fumadocs, served at `/docs`), linking audience-separated `staff-guide.mdx` and `portal-guide.mdx`. Together they cover every current screen/action in customer language (steps, fields/options/defaults/limits, permissions, connected effects, corrections, empty/error states, and unavailable controls) without mixing staff and portal instructions or exposing internals.
- The documentation-maintainer prompt has a `## Voice` rule (2026-09-07, PR #187): plain and a little casual, short declarative sentences, ordinary words, contractions fine, no em dashes stated as a hard rule with spelled-out substitutions, and a correct sentence is left alone rather than reformalized. It also may only delete a doc section once the screen or route it documents is confirmed actually gone, not merely reworded — an earlier run (PR #181) deleted the portal guide's still-live "Coming up" section, restored by PR #184's merge resolution.
- Customer guides stay visually neutral and close to browser defaults for now. A future MGR design language will be developed once and carried across the application, API documentation, and customer documentation rather than designed separately in any one surface.
- The MGR mark is the v1 tank/porthole SVG. `app/icon.svg` is the favicon; `lib/mgr-icon.ts` owns the path; `components/mgr-icon.tsx` is the in-app reuse. Dream PRs are published by the MGR GitHub App (`mgr[bot]`), not `claude[bot]`; the model has read-only GitHub access and a separate deterministic job mints the App token from `vars.MGR_APP_ID` + `secrets.MGR_APP_PRIVATE_KEY`. Upload `docs/brand/mgr-github-app-icon.png` (a raster of the same mark) as the app logo.
- Every AI mutation is proposal-only: registry-owned server preview,
  canonical effects, explicit user confirmation, same `requestId` +
  `previewToken`, and stale revalidation. There is no generic Undo. Replay and
  offline outbox stay disabled until durable server dedupe/result replay exists;
  voice and server chat history are deferred.
- Before affected UI work, close the explicit rev-4 gates: pre-tenant
  provisioning, invite compensation, import per-row RPC/dedupe, FG correction
  identity/report semantics, durable taproom count snapshots, shipment invoice
  timing, exact QBO payload persistence, and typed batch-completion/loss
  reconciliation. Portal fulfillment source is closed
  (`set_portal_fulfillment_source`, PR #29). A registry name or client-held ID
  does not prove a gate is met.
- The public HTTP API is `POST /api/command` (the command registry). Auth is
  the existing Supabase user session: browser cookies, or
  `Authorization: Bearer <access_token>` from password grant against the
  Supabase Auth URL. No resource REST routes, no API keys, until a non-user
  machine client exists.
- Public-schema table DML is revoked from `anon` and `authenticated`; local
  Supabase also disables automatic Data API grants so the baseline ACL is
  self-contained. Staff writes are authorized in SQL, not only in the
  registry: each mutation RPC is `security definer`, calls
  `private.assert_staff(brewery, roles)` (or `private.assert_customer`)
  first, then claims `(actor, requestId)` against brewery, command, canonical
  payload, and result in `private.command_requests`. Raw Data API writes fail
  42501 for every browser JWT. (2026-09-01 merge decision: PR #27's
  `security invoker` + `require_authorized_staff_rpc` + `request.path`
  policies were superseded by this model; only its additive work was kept.)
  New writers must be granted explicitly in the baseline's Data API grants
  section and pinned in `tests/data-api-boundary.test.ts` /
  `tests/rls-command-boundary.test.ts` (nothing is auto-exposed).
- Until the durable Task 13 import workflow lands, each import row operation
  derives a deterministic UUIDv8 from SHA-256 of the complete top-level
  `requestId`, row number, and operation number. This is replay-safe but not
  durable job state.
- Integration credentials never sit in a public table. `private.integration_tokens`
  is reachable only through `lib/supabase/integration-tokens.ts` (server-only,
  admin/sales, visible-connection check, then service-only RPC that rechecks
  membership); connection delete/identity change purges the token row.
- `import_csv`, `invite_staff`, `invite_customer_user` stay registered but fail
  closed (P1.9) until the durable external-write gate exists; the Import screen
  and invite forms are removed rather than hidden.
- Chat notifications are staff-only and Slack-first but provider-neutral: one
  active installation per brewery/provider, personal App Home/DM plus one
  admin-approved digest channel, and no quiet-hours bypass in the first
  release. Slack-to-MGR writes remain projection-only until the trust/replay
  gates close; `lib/chat/jobs.ts` is the rule-4 service-role owner.
- **AI chat design consolidated (2026-09-07, PR #180):** the language layer is
  a client of the command registry — `preview_command` canonicalizes and
  issues a version token, a human clicks every write, and the agent's read
  scope is exactly `listTools({aiOnly:true})` filtered by role, so coverage
  only grows by registering commands, never by widening model access. Spec
  `.agents/superpowers/specs/2026-09-07-mgr-ai-chat-design.md`, plan
  `.agents/superpowers/plans/2026-09-07-ai-chat.md`; supersedes slice 1C's
  composer tasks 8–10. Companion decisions from the same review: staff roles
  become an array (`brewery_users.roles staff_role[]`, a junction table was
  rejected); Style is its own per-brewery table; portal customers may read a
  brand + expected-week projection of planned batches through a gated view,
  never `batches` itself.
- **Purchasing design decided (2026-09-07, PR #173):**
  `.agents/superpowers/specs/2026-09-07-mgr-purchasing-send-and-lead-times.md`.
  Sending a PO stays one `draft → sent` transition — transport (direct /
  mailto / external) is a property, never a fork in `po_status`, and only
  `direct` earns delivery language. Lead time moves off `materials` onto the
  vendor as an observed (`ordered_on → received_on`), never-stored view. A
  hop contract's remaining commitment needs four numbers — committed,
  received, on order, available — not two. Unused material is never entered
  (consumption derives from output); damage is the only thing captured at
  packaging-run close, and labels are counted by whole roll, never
  individually.
- **Locations, bins, and internal stock transfers designed (2026-09-06, PR
  #158):**
  `.agents/superpowers/specs/2026-09-06-mgr-locations-bins-transfers-design.md`.
  `bins` + `location_kind = 'storage'`; `location_id`/`bin_id` added to
  material, keg, and inventory ledgers so all three answer "where" the same
  way; an internal move is its own document, `stock_transfers`, never a
  third `orders.kind` (orders stay a priced customer document); bin-to-bin
  moves inside one location are structurally barred from becoming
  deliveries (`check (to_location_id <> from_location_id)`).
- **The HTTP API reference lives at `/docs/api`, not README (2026-09-07, PRs
  #165–#167; split from one generated page into `content/docs/api/` — an
  index plus one page per area — 2026-09-25, PR #492):** generated by
  `bun run docs:api` from the command registry (available operations) and
  each screen's declared `reads`/`writes` (designed operations);
  `tests/api-docs.test.ts` fails on drift, including round-tripping every
  generated curl example through its own command's Zod schema. The
  `http-api` agent (`.agents/agents/http-api.md`) now runs post-merge via
  `.github/workflows/http-api-agent.yml`, mirroring the documentation agent:
  it may edit prose and screen `reads:`/`writes:` annotations only, never
  the generated tables (`Bash` is absent from its allowlist — the workflow
  regenerates), and every PR it opens states whether the designed-operation
  count shrank or held.

## Gotchas (carried from MGR v1)
- PostgREST caches the schema: after DDL, errors naming a column/enum that plainly exists are a stale cache — `NOTIFY pgrst, 'reload schema'` or restart the stack before debugging.
- `Unregistered API key` / `Invalid API key` with no Postgres error code means the key was rejected before PostgREST: URL and key are from different Supabase instances. Check `NEXT_PUBLIC_SUPABASE_URL` first; `curl -sD- -H "apikey: $KEY" "$URL/rest/v1/"` gives the real answer.
- `security definer` functions get PUBLIC execute by default; revoke from `public, anon` or the RLS helpers are callable unauthenticated (gated by `tests/schema-rules.test.ts`).
- One local Supabase stack serves every worktree. A `supabase db reset` in another session silently swaps the loaded baseline; the tell is a burst of "relation does not exist" / undefined-column failures across suites. Reset from your own worktree and run the suite immediately; if it flips mid-run, check `docker ps` for a freshly restarted `supabase_db_mgr`. This is scoped to the **dev/app** stack (`AGENTS.md` Authority: "do freely ... on the app stack"); the separate **test** stack no longer has this failure mode (next bullet).
- The test stack (`scripts/test-db.sh`, `mgr_test` project) has a portable `flock`-based lock (`scripts/test-db-lock.pl`, PR #563): a reset holds it exclusive, every vitest run holds it shared via `globalSetup`, and a reset waits for running suites while new suites queue behind a pending reset. It also resets only when the migrations' `git hash-object` (plus `tests/supabase/supabase/config.toml`) changed, stored as a comment on the `postgres` database — `MGR_TEST_DB_RESET=1 scripts/test-db.sh` forces it. Before this, a parallel session's reset landing mid-run looked like broken code.
- Worktrees don't inherit `.env.local` (gitignored, per-checkout) — `bun run test`/`bun run dev`/`bun run test:e2e` in a fresh worktree fail silently with `supabaseKey is required` until it's copied in from the main checkout.
- `claude-code-action` rejects non-human workflow actors unless `allowed_bots` is set. Scheduled/manual dreaming runs as `github-actions[bot]`; its generated `dreaming/main` PR and the `documentation/user-guide` PR skip `claude-review` so the bot never reviews its own maintenance output.
- A push authenticated with `github.token` (the default `GITHUB_TOKEN`) does not trigger other workflow runs — `ci.yml` silently never fires on a PR opened that way, and it can reach a human unchecked. Any job whose push must trigger CI (dreaming, the documentation agent) mints the MGR GitHub App token instead and takes its git identity from the app slug (PR #49; same pattern dreaming already used for its own push).
- `git diff --name-only` never reports a file an agent created rather than edited, so a job that gates on that diff being empty will silently discard untracked output as "no changes". Stage first (`git add -A`) and diff the index instead (PR #49, documentation-agent.yml).
- `claude-code-action` rewrites the repository's git identity to `claude[bot]` while the model runs, overriding any identity configured before it (e.g. dreaming's own prepare step). A commit made in a later job step inherits that rewritten config unless it names the author explicitly; `dreaming.yml`'s validate step now commits with `git -c user.name=$DREAM_LOGIN -c user.email=$DREAM_EMAIL` so the dream commit is attributed to `mgr-bot`, not `claude[bot]` (PR #131).
- A test that freezes the worker clock to a fixed timestamp while the code under test queues rows keyed off the real `now()` (e.g. `next_attempt_at`) goes red with no code change once wall-clock time passes that fixed point. Pin a frozen-clock test a decade or more ahead of wall time, not to a plausible recent date (`tests/chat-jobs.test.ts`, `tests/chat-delivery-policy.test.ts`, PR #151).
- Claude Code Review now skips any PR by checking `github.event.pull_request.user.type != 'Bot'` (`claude-code-review.yml`), not the two hardcoded branch names (`dreaming/main`, `documentation/user-guide`) it used before — the old check missed `docs/http-api` and any future bot-maintained branch and once failed CI outright on a `mgr-bot`-authored PR ("Workflow initiated by non-human actor"). `tests/workflow-contract.test.ts` asserts the `user.type` condition, not branch names (PR #169, #170).
- A parallel `.agents/worktrees/<branch>` session holding port 3000 pushes your own `next dev` to 3001 silently; browsing 3000 then renders the other worktree's tree, so a real change reads as "not applied." The `browse` skill's step 4 eyeball check must target the port `next dev` actually printed (`lsof` finds whose checkout owns 3000) (PR #176).

## Process
- Reviewers that verify by execution (writing to the live DB) find real bugs; read-only reviews find style.
- Visually check rendered UI before calling UI work done (a serif-font regression went unnoticed).
- Operating loop and authority boundaries are in `AGENTS.md`; don't repeat them here.
- Tests never read design docs. `tests/chat-preview.test.ts` once grepped the wireframes HTML as a drift guard; the wireframe moved and the test went red for the wrong reason. Code-to-code assertions (fixtures ↔ renderer) carry the guarantee; docs drift by design (2026-09-02).
