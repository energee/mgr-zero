# MEMORY

Durable facts and decisions for agents working on mgr. Update when a decision is made; delete when it stops being true. Not a changelog — see PROGRESS.md.

## Project
- mgr (github.com/energee/mgr-zero): multi-brewery operations SaaS. Next.js App Router + Supabase.
- Not in production. Hosted Supabase (`uogrvqmrbmolvtftotsf`, production) and Vercel projects exist and have been used for pre-release evidence gathering; a second Supabase project (`ugzhwxzictzvrzlacjmv`) is the decided Preview target. Public sign-up is disabled on production (#467, 2026-09-25): staff arrive only by invitation. Release is not signed off — owner Ted, tracks #311, current record is `docs/operations/release-readiness-2026-09-18.md` (decided 2026-09-18: pilot scope is J01 ordering/J02 picked-order adjustment/J06 recovery; Auth SMTP via Resend, parked on a sending domain; the 171 authenticated-executable-RPC advisor is accepted as designed). Any further hosted/deploy action is still ask-first (`AGENTS.md` Authority).
- Setup, ports, dev login: `README.md`. Ownership + iron rules: `.agents/ARCHITECTURE.md`.

## Decisions
- **2026-09-02 — Bun is the package manager.** Installs and scripts go through Bun (`bun install`, `bun run`, `bunx`); Node 22 remains the Next.js runtime. The committed lockfile is `bun.lock` only.
- **`components/mgr/screens.tsx` is the source of truth for MGR screens** (2026-09-02; the wireframe HTML and `/design` gallery are deleted, PR #133). Change navigation/flows and the `SCREENS` array together — the record count is not sacred, a real operator job gets a real body, never an annotation chip. The records publish read-only at `/docs/screens`, `/docs/screens-explore` (role-scoped persona switch, sheets portal inline, browser back retraces taps; `tests/tap-coverage.test.ts` fails if any tap resolves nowhere) and `/docs/integrations` (venue frames); all embed the one public `app/(frames)/screens/frame/[s]` route (the explorer draws screens inline in their own shell instead) — a generated page, deliberately outside the documentation agent's allowlist (`tests/design-docs.test.ts`). Staff uses Today/Beer/Work/More; the wholesale portal has its own Order/Orders/Invoices/Account shell. Frames draw only user-visible UI — the annotation, gate-copy, and Today-exemplar rules live in the plan preamble and §5, not here. Edit the typed records directly, never regenerate.
- **MGR screen controls, established across the design pass (2026-09-03, PRs #89–#127):** one primary (filled) action per screen, other verbs outline/ghost; quantities use the shared stepper (`E.qty`, `components/mgr/qty.tsx`) and dates the shared `DatePicker` (`E.edit` with `type="date"`), never an on-screen keypad — a native number input is lint-banned anywhere outside `qty.tsx`; a field a user can change renders a real shadcn `Input`/`Select`/`Switch`, never a chip standing in for a field; `E.tabs` is for view switchers, chips stay for filters and single-choice fields; the shell and its grids use the real desktop width (`md:max-w-5xl`, responsive `E.btns`/`E.tiles`) rather than a phone-width column stretched wide.
- **Accent colors carry semantic status/action roles (2026-09-06, PR #156):** the six-accent palette is fixed to meanings, not chosen per screen — confirm green, put-back/assign orange, pick/count/resume cyan, general actions purple, destructive red/pink — with AA-checked light/dark tokens; color supplements the label/icon, it never stands alone. Sign out is classed destructive (red), not the teal accent for "irreversible actions that still write a record" (PR #155); `app/globals.css`'s token comment is the single statement of which accent means what — update it in the same change that reclassifies a control.
- **Migrations accumulate; a committed one is never edited again (2026-09-13, PRs #285, #337).** The rule and its lock test are in `AGENTS.md` Authority. The two hand-edited files were restored to exactly what hosted ran, and everything edited into them became one catch-up migration. Pre-#285 baseline design: `.agents/superpowers/specs/2026-08-31-mgr-schema-decisions.md`.
- **Backend program rulings (Programs 0–10).** Gravity is stored in °Plato only with a per-user/brewery display-unit preference, resolved server-side, never stored computed (Program 5). A keg event naming a customer only ever means shipped/lost-at-customer, never `found` (Program 7). A movement's tax treatment is resolved and frozen at insert, never recomputed at report time, so editing a channel or customer later never restates a filed month (Program 9). (Lead time, `sent_via`, departed routes, and global search: `.agents/ARCHITECTURE.md` ownership table.) `ship_order` records the bin and lot of each source the caller names (migration `20260927080000`); the ship form always names its sources, so lot trace reaches the customer for lot-tracked stock. A legacy call that omits `sources` consumes untracked first-bin stock and records no lot.
- **Order confirmation is review-only (2026-10-13 owner ruling, #713, PR #887).** No surface confirms an order without the Confirm order review (`/orders/[id]/confirm`); the order detail footer has no direct Confirm. ATP stays a soft warning: warn, don't block.
- **A role guard must be NULL-safe (2026-10-15, #895, PR #897; #968 later dropped the scalar `staff_role(b)`, but the rule holds for any role check).** `public.staff_role(b)` returned NULL for a non-member, so `staff_role(b) <> 'admin'` or `not in (...)` is NULL and never raises. Use `is distinct from 'admin'` or `coalesce(staff_role(b)::text, '') not in (...)` (as `private.assert_chat_admin` does). Six QuickBooks RPCs let an outsider write before this fix.
- **A SKU's own `skus.upc` wins over its price group's barcode (2026-10-14, #879, PR #879 D2 amended).** `price_group_barcodes` holds one nullable UPC per price group × packaged format; `list_formats` and `get_format_composition` name `formats_price_group_fk` because the table adds a second PostgREST path.
- **Notification worker capacity is measured locally only (2026-10-23, #936).** Email sends at most 10 messages per 5-minute cron run; chat delivery and scan have headroom for a one-brewery pilot. Hosted scheduler cadence, function deadlines and real provider latency are unmeasured; see `docs/operations/worker-capacity-local-2026-10-23.md`.
- Product spec: `.agents/superpowers/specs/2026-08-30-mgr-slice1-core-orders-design.md`.
- Schema revision 2 (2026-09-02, §16 of the design doc — implemented in `00001_baseline.sql` and later migrations): `products` → `brands`, and a batch's identity becomes `intended_brand_id`, nullable, because identity is optional at brew and already enforced at packaging by `lots.brand_id NOT NULL`. `formats` own `bbl_per_unit`; SKUs stop carrying it.
- Taproom inventory: **the physical count posts depletion; POS is the variance check** (2026-09-02, §16.15). This inverts the rule drawn in the POS wireframes, which need amending. Tapping and kicking a keg have no ledger effect at all — POS yields *expected* consumption, the count yields *actual*, and the gap is the report a taproom manager acts on.
- Schema conventions live in `.agents/ARCHITECTURE.md`; the quote behind "no status columns" is Ted's: "if it won't be accurate I don't want it".
- Every merged PR gets a full customer-documentation pass, with `workflow_dispatch` on `main` as the recovery path. Claude has read-only GitHub permissions and may edit only the master, staff, and portal guide MDX files; a separate deterministic job rejects any wider or active-content diff and maintains one reviewable `documentation/user-guide` PR. The agent never commits directly to `main`. The publish step mints the MGR App token (same as `dreaming.yml`) rather than `github.token`, so the resulting push triggers `ci.yml` (PR #49).
- `content/docs/index.mdx` is the documentation master (Fumadocs, served at `/docs`), linking audience-separated `staff-guide.mdx` and `portal-guide.mdx`. Together they cover every current screen/action in customer language (steps, fields/options/defaults/limits, permissions, connected effects, corrections, empty/error states, and unavailable controls) without mixing staff and portal instructions or exposing internals.
- The documentation-maintainer prompt has a `## Voice` rule (2026-09-07, PR #187): plain and a little casual, short declarative sentences, ordinary words, contractions fine, no em dashes stated as a hard rule with spelled-out substitutions, and a correct sentence is left alone rather than reformalized. It also may only delete a doc section once the screen or route it documents is confirmed actually gone, not merely reworded — an earlier run (PR #181) deleted the portal guide's still-live "Coming up" section, restored by PR #184's merge resolution.
- Customer guides stay visually neutral and close to browser defaults for now. A future MGR design language will be developed once and carried across the application, API documentation, and customer documentation rather than designed separately in any one surface.
- The MGR mark is the v1 tank/porthole SVG. `app/icon.svg` is the favicon; `lib/mgr-icon.ts` owns the path; `components/mgr-icon.tsx` is the in-app reuse. Dream PRs are published by the MGR GitHub App (`mgr[bot]`), not `claude[bot]`; the model has read-only GitHub access and a separate deterministic job mints the App token from `vars.MGR_APP_ID` + `secrets.MGR_APP_PRIVATE_KEY`. Upload `docs/brand/mgr-github-app-icon.png` (a raster of the same mark) as the app logo.
- Every AI mutation is proposal-only: registry-owned server preview,
  canonical effects, explicit user confirmation, same `requestId` +
  `previewToken`, and stale revalidation. There is no generic Undo. The offline
  outbox replays only fermentation readings (`lib/composer/offline-policy.ts`);
  voice and server chat history are deferred.
- The rev-4 gates are closed except exact QBO payload persistence: pre-tenant
  provisioning (`provision_brewery`, `accept_account_invitation`), invite
  compensation, import per-row RPC/dedupe, FG correction identity, durable
  taproom count snapshots, shipment invoice timing (`ship_order`
  `invoiceTiming`), typed batch-completion/loss reconciliation, and portal
  fulfillment source (`set_portal_fulfillment_source`, PR #29). See
  `.agents/ARCHITECTURE.md`. A registry name or client-held ID does not prove
  a gate is met.
- Public HTTP API: `POST /api/command` only (`.agents/ARCHITECTURE.md` iron
  rule 1). A script gets its Bearer access token by password grant against the
  Supabase Auth URL. No resource REST routes and no API keys until a non-user
  machine client exists.
- Writes are authorized in SQL (`.agents/ARCHITECTURE.md` iron rule 5): each
  mutation RPC calls `private.assert_staff(brewery, roles)` (or
  `private.assert_customer`) first, and raw Data API writes fail 42501 for every
  browser JWT. Nothing is auto-exposed (`auto_expose_new_tables = false`): a new
  writer is granted in its migration and pinned in
  `tests/data-api-boundary.test.ts` / `tests/rls-command-boundary.test.ts`.
- Integration credentials never sit in a public table:
  `private.integration_tokens`, behind `lib/supabase/integration-tokens.ts`
  (iron rule 4). That boundary is server-only (`import "server-only"`) and
  admits Admin or Sales for token access; a few operations are Admin-only.
  Connection delete or identity change purges the token row.
- `import_csv` (`begin_csv_import` plus per-row `import_csv_row`) and
  `invite_staff` / `invite_customer_user` (the durable invitation workflow)
  are live; see the CSV and Auth invitation sections of
  `.agents/ARCHITECTURE.md`.
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
  rejected; built by #797, PR #968); Style is its own per-brewery table; portal customers may read a
  brand + expected-week projection of planned batches through a gated view,
  never `batches` itself.
- Purchasing follow-ups (2026-10-29, #1601, #1612): only a draft PO is editable, by replacing its lines whole through `update_purchase_order` (note kept; create and update share `private.insert_purchase_order_lines`). A PO's closure (Cancel / Close short) folds behind a disclosure below the order's next verb. Vendor reads filter in Postgres through `vendorId` / `defaultVendorId` inputs on existing list commands, not a new query (plan `docs/plans/vendor-detail.md`).
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
- **The HTTP API reference lives at `/docs/api` (`content/docs/api/`, one page
  per area), not README.** `bun run docs:api` generates it from the command
  registry (available operations) and each screen's `reads`/`writes`
  (designed operations); `tests/api-docs.test.ts` fails on drift, including
  round-tripping every curl example through its command's Zod schema. Every
  PR the post-merge `http-api` agent opens states whether the
  designed-operation count shrank or held; its edit limits are in
  `.agents/agents/http-api.md` "In CI".
- **Keg deposit and Keg fleet Returned event stay separate records (2026-09-26
  owner decision, issue #577, PR #605).** Reconciliation, not a merged write:
  `kegDepositRows` (`lib/keg-deposits.ts`, pure) flags a customer × pool × size
  row only once a deposit on it was refunded and kegs on deposit differ from
  kegs out plus kegs lost at that customer (a lost keg keeps its deposit, so
  it still counts as out). Shipping alone charges the deposit but posts no
  keg event, so it never flags by itself — that gap is a Shipped event not yet
  entered, not drift. Voided and written-off invoices no longer count toward
  deposits held (#617, PR #630).
- **`upsert_*` commands replace the whole record (2026-09-26 owner decision,
  issue #589, PR #606).** An omitted field may be cleared or reset to its
  default; a command must say explicitly which fields instead keep their
  saved value when omitted (`upsert_material`'s `purchaseUomFactor`,
  `lotTracked`, `reorderPoint`, `extractPotential`) or clear only on an
  explicit `null` (`upsert_brand_approval`, `upsert_state_registration`,
  `upsert_brewery_state_license`). Stated in `content/docs/api/index.mdx`'s
  Conventions section — read it before adding a new `upsert_*` command.
- **Finished-goods cost is frozen at packaging close and read from the ledger (2026-10-13, #810, PRs #845, #858).** A run's unit cost is frozen in `packaging_run_outputs.unit_cost_cents` from the consumed lot's newest uncorrected receipt; missing prices stay null and nothing is backfilled. Per-order COGS (`order_line_cogs`, `get_order_cogs`) is never stored: shipped `sale_removal` rows minus linked `return_in` rows at the shipped lot's frozen cost, margin withheld while any shipped unit is uncosted. Admin/Sales gating is command-level only, so cost columns follow table RLS and Brewer or Warehouse can read them through the Data API (owner-approved).
- **A movement's report date is its frozen `occurred_on`, not insert time (2026-10-13, #821, PR #847).** `close_packaging_run` dates stock by Packaged on and refuses a future date or one inside a filed period; other writers default to their insert day. Cellar losses still count on the day recorded. Any function redefining `file_compliance_report` or `private.generate_compliance_report` must start from migration `20261013100000` (#816, PR #857), which retired the `externalMappingRequired` filing gate: cellar Taproom removals file as taxpaid under the frozen Taproom channel treatment.
- **Hosted scheduled jobs run from GitHub Actions, not Vercel cron (2026-10-13, PR #861).** Hobby cron fires at most daily, so `hosted-jobs.yml` POSTs the bearer-authenticated email and retention routes.
- **Staff authorization is role-set overlap (2026-10-17, #797, PR #968).** `brewery_users.roles` replaced the scalar `role` and `staff_role()`. Admin is listed wherever allowed, never injected by a helper. A role-specific restriction applies only when every held role is restricted. Portal contexts stay customer-only and invitations grant one role. Removing Admin from a multi-role member is a demotion and cannot remove the last admin. A later restatement of a role body must keep the #929 Slack initiator and #640 Square merchant fences (`20261017144200_staff_roles_security_guards.sql`).
- **After filing, reporting-basis dates change only by an Admin correction (2026-10-17, #939, PR #969).** `correct_reporting_basis` records old/new date, actor, time and reason, and appends amendment evidence to every affected filed period; original filed snapshots are never rewritten and MGR never transmits a replacement filing. The ordinary books-opened setter stays frozen.
- **Receipts post one QuickBooks Bill per receipt revision chain (2026-10-17, #870, PR #966).** Amount is receipt movement unit cost × counted base quantity, not the PO. The exact payload, company and provider `requestid` are saved before the POST; retry queries first, then replays identical bytes. Only an explicit corrected attempt after a definite rejection makes a new snapshot. Corrections to a posted Bill are adjusted in QuickBooks; Bill payments stay there.
- **Projected packaging demand (2026-10-17, #869, PR #963).** SKU `batch_share` (brand-wide max 100%, inactive SKUs still count) and brewery `days_to_package` (default 14, 1–120) drive Planning. A non-cancelled linked run replaces a batch's whole projection and a closed run never resurrects it. Known gap: an unlinked tankless run names no batch until its source tank is picked.
- **Square catalog ownership (2026-10-22, #1093, #1099, plan `docs/plans/square-packaged-menu.md`).** MGR owns the beer items it publishes and maps them itself; a Square variation it did not publish needs a decision on Menu only once it sells at a menu's location (unmapped before then equals ignored). A case is six 4-packs on one Case SKU stock, sold as a "<Beer> Four Pack" item with no Four Pack SKUs. A beer keeps one Square item per kind for life: hidden per location, archived when present nowhere, restored on return, never deleted.
- **A beer's packages are Sells as switches on the Brand page (2026-10-22, #1091, plan `docs/plans/beer-sells-as.md`).** On means an active SKU, off means inactive, never deleted; a format inside another (Four Pack in Case) has no switch and sells from the parent's stock; a pour is a serving on the price group, not a SKU.
- **Staff read policies use `brewery_id in (select my_staff_brewery_ids(...))`, never per-row `is_staff_of(...)`; the proxy refreshes the session with `getClaims()` (2026-10-22, #1102).** `is_staff_of` is SECURITY DEFINER and re-parses request headers each row (385 ms vs 4 ms per 50k rows); `tests/staff-roles-schema.test.ts` enforces it.
- **Vessels are admin-managed (2026-10-22, #1095).** `upsert_vessel` is Admin-only; `delete_vessel` deletes a never-used vessel, retires one with history (`active = false`, name reusable, takes no beer) and refuses one holding beer.
- **Page and save latency limits (2026-10-28 owner, #1490, #1491, PRs #1587, #1596).** A page's main content and primary action are usable within 2 s; a save shows its result within 1 s warm, 3 s cold (#1403). Network idle is not the metric, so post-load prefetch is not a defect. Stage timings come from `Server-Timing` (`lib/server-timing.ts`: proxy session, `/api/command` auth, admission, command); server components cannot set headers, so pages log their stage as one JSON line. Local runs met every limit; live signed-in pages and saves are unmeasured (`docs/operations/work-and-more-latency-2026-10-28.md`, `pilot-latency-protocol.md`).
- **One license home (2026-10-28 owner, #1517, PRs #1591, #1597).** `brewery_state_licenses` holds every license; `breweries.pa_license_no` was copied into the PA brewery license and dropped, and `update_brewery` lost that parameter. Ship-to labels are unique per customer, trimmed and case-insensitive (`ship_tos_customer_label_key`, #1487); the server maps a 23505 on it to the form's own Label message.
- **Production attention is a proposal only (`docs/plans/production-attention.md`, #1571).** Deterministic rules own missing inputs and blockers; Jev may only flag possible concerns from verbatim source text, never explain, authorize or navigate. No product integration or schema exists yet.
- **Shipment posting is recording time (2026-10-30 owner, #1663, PR #1692).** Shipment, removal, invoice-issue and shipped-keg timestamps share a wall-clock instant taken after the stock locks, not a future commit timestamp; a recording-to-commit midnight gap is accepted. Replacements must keep this. Brewery timezone cannot change after any filed report. A zero one-way keg fee is captured separately from its nullable amount so later adjustments never reprice it.
- **A short pick cancels the missing quantity (2026-10-31, #1635, PR #1709).** `keep_owed` is removed with no alias; older migrations and events are untouched. Pickup vs delivery on an unshipped order changes only the flag (`set_order_pickup`, PR #1695); buyer checkout is unchanged.
- **Integration failure rules (2026-10-30, #1661, #1631, PRs #1697, #1676).** Square failure cleanup revokes the merchant-wide grant only after a database reservation, and never when a stored connection for that merchant exists (revoking only the access token leaves authorization active). Email retries back off 5, 10, 20, 40, then 60 minutes within the 23-hour Resend dedupe window. Every QuickBooks and Square fetch has a 20 s timeout; a sync that overruns its 180 s read budget records failure and keeps its retry identity, never a partial result.
- **Tenancy and auth boundaries (2026-10-30, #1659, PR #1701, draft).** Command and chat requests need JSON and an Origin matching `APP_URL`; auth emails and invoice-payment redirects build from `APP_URL`, never request Host; OAuth state is server-random and stored as a digest. Identity labels are presentation only; authorization comes from membership and roles. Hosted Auth redirect wildcards await owner approval.
- **Compliance and correction rulings (2026-10-31, PRs #1705, #1706, #1698).** Beer in process for an ended period is replayed as of period end in the brewery timezone; saved snapshots are never rewritten. Admin may correct the latest Taproom count once, either direction, by append-only compensation. Brew-turn, used-receipt and Square-mapping corrections append compensating facts and never rewrite history.
- **Owner merge hold on SQL PRs (2026-10-30).** Database PRs land in migration-timestamp order, only by the owner, each synced with `scripts/land-pr.sh <pr> --sync-only`; green branches alone are not proof of the assembled queue. Hosted backup/restore gates #1615 and #311 are separate from that order.

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
- Claude Code Review skips bot PRs by checking `github.event.pull_request.user.type != 'Bot'` (`claude-code-review.yml`), never a list of branch names: a name list misses the next bot-maintained branch and fails CI on it ("Workflow initiated by non-human actor"). `tests/workflow-contract.test.ts` asserts the `user.type` condition (PRs #169, #170).
- If `tests/chat-jobs.test.ts` times out locally, that is the shared dev
  database, not your change: its `runChatScan` walks every brewery with an
  active `chat_installations` row, and every past run left a fake one behind.
  `update chat_installations set state = 'disconnected' where state = 'active'`
  clears it (no seed creates installations, so every active row is a leftover).
- A parallel `.agents/worktrees/<branch>` session holding port 3000 pushes your own `next dev` to 3001 silently; browsing 3000 then renders the other worktree's tree, so a real change reads as "not applied." The `browse` skill's step 4 eyeball check must target the port `next dev` actually printed (`lsof` finds whose checkout owns 3000) (PR #176).
- Stock and order writers race on lock order, and each fix so far found the next pair: a pick checked the bin without the ledger locks (#1033, PR #1064), `record_batch_addition` skipped the `material_movements` lock (#1046), confirms did not see each other's allocations (#1035, PR #1068), raises and standing allocations skipped the per-SKU `atp:` advisory lock (#1070, PR #1074), and a wholesale raise froze `skus` before key-sharing the brewery row, deadlocking with `portal_submit_quote` (#1075, PR #1076). Before a new writer checks stock or ATP, copy the lock set and order of the existing writers (brewery row, then `atp:` locks in sku_id order, then `skus`/ledger tables) and add a concurrent-session test with `pgSession` from `tests/helpers.ts`.
- QuickBooks token refresh is serialized by a 45s lease on `private.integration_tokens` (#1032, PR #1071); a refresh interrupted after Intuit rotated the token is an accepted window that needs an Admin reconnect (#1073, PR #1077). Abandoned OAuth exchanges are reaped by the daily retention job (#1034, PR #1072).
- Open watchdog issues #1598 (2026-10-29, `hosted jobs`), #1700 (`order-email`) and #1699 (workflow startup) report hosted jobs failing. Until they close, treat hosted email delivery and the daily retention prune as not running (`hosted-jobs.yml`, PR #861). Separately, a red doc agent means a stale API reference: run `bun run docs:api` and check `tests/api-docs.test.ts` before trusting `content/docs/api/` (earlier #1101 is closed).

## Process
- Reviewers that verify by execution (writing to the live DB) find real bugs; read-only reviews find style.
- Visually check rendered UI before calling UI work done (a serif-font regression went unnoticed).
- Retention decisions (2026-10-08, #758/#766): QuickBooks sync stops re-reading an invoice 90 days after a sync saw it settled, so a later edit made in QuickBooks goes unnoticed by design; finished command-request replay records are pruned after 90 days; a closed brewery's data is kept 3 years and removing it afterward is a manual step.
- Lolev orders prerequisites (2026-10-16, #907): a customer and ship-to have an ISO country; a US one needs a state, street/city/ZIP are optional, a foreign one needs only a label; export removals record `dest_country` and need export treatment. `orders.pickup` is never routed and always invoiced at ship. A one-way keg is a SKU whose keg format has no keg pool; its fee is a separate non-refundable `one_way_keg_fee` invoice line frozen at ship (needs a QuickBooks item mapping). `record_historical_order` (admin) writes a shipped pickup order and paid invoice before `books_opened_on` with no stock, deposits, fees or notifications; the invoice is `not_synced`, never pushed, and cannot be returned.
- Lolev history import decisions (2026-10-14, #868/#873/#874): `breweries.books_opened_on` is the day compliance reports start counting; earlier ledger rows stay in batches and inventory history but move no report figure, and a period starting before it is refused. A reading or brew record names a batch; its tank is optional but must hold that batch (composite FK), so an occupancy's `batch_id` cannot change once either names it. Tankless history is written only before `books_opened_on` by `record_historical_batch`, and is corrected by re-import. An imported OG is a gravity reading dated brew day. Lolev finished goods are not imported; MGR owns them from the packaging-run cutover. A reading needs temperature, gravity or pH, enforced in the command schema only (no DB check, since existing rows may have all three null).
- One-way (disposable-shell) kegs are packaging materials on their own keg format with no keg pool (#871); returnable kegs stay on a separate format or they would draw a shell.
- Operating loop and authority boundaries are in `AGENTS.md`; don't repeat them here.
- Tests never read design docs. `tests/chat-preview.test.ts` once grepped the wireframes HTML as a drift guard; the wireframe moved and the test went red for the wrong reason. Code-to-code assertions (fixtures ↔ renderer) carry the guarantee; docs drift by design (2026-09-02).
