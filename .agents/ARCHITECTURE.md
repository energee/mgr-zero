# Architecture

Ownership map and iron rules for MGR. `AGENTS.md` routes here; `README.md`
covers setup. When a concept needs changing, change it at its owner below —
never copy it into a second place.

## Ownership

| Path | Owns |
| --- | --- |
| `supabase/migrations/*.sql` | Schema, RLS policies, triggers, grants, and the transactional command-request ledger. The only source of truth for data rules. Pre-deploy, the baseline is edited in place (see `.agents/superpowers/specs/2026-08-31-mgr-schema-decisions.md`). Application roles have read-only table access; every mutation enters through an explicitly granted, idempotent `security definer` RPC with `search_path = ''`, database-derived actor/tenant/role checks, and a canonical request hash. Private helpers and implementation functions are not executable by application roles. |
| `lib/commands/registry.ts` | `defineCommand` / `defineQuery`, `Ctx`, role checks, `CommandError`. Every domain operation the app performs is registered here. |
| `lib/commands/<area>.ts` | Business logic per area (catalog, inventory, orders, customers, portal; `import.ts` owns independent, atomic CSV rows with durable batch and row outcomes). Handlers read through the RLS-bound `ctx.db`; public-schema writes call the narrow RPC boundary and forward `CommandExecution.requestId`. `orders.ts` owns order lifecycle (create/submit/confirm/adjust/cancel), allocations, pick/ship, per-shipment invoices, credit memos, and replenishment. `customers.ts` owns customer/ship-to/price-list CRUD and the portal fulfillment source. `catalog.ts` owns products, SKUs, locations and their bins (`list_bins`, `create_bin`, `update_bin`, `delete_bin`); `inventory.ts` owns the movement ledger at bin grain (`record_movement` needs a `binId`; `get_bin_on_hand`). `portal.ts` owns the customer-role commands (`portal_create_order`, `portal_update_draft_order`, `portal_submit_order`, `portal_catalog`, `portal_orders`, `portal_order`, `portal_invoices`) — the only commands a `customer` role may call. |
| `lib/commands/taproom.ts` | Keg pools/events, durable explicit-bucket taproom counts, and tap interval reads plus atomic tap/kick/swap RPCs. Intervals freeze nominal size, never write inventory, and keep guest identity separate from own SKUs absent stock. |
| `lib/commands/all.ts` | The one side-effecting import that registers every command module. |
| `app/api/command/route.ts` | The single HTTP entry point. Dispatches to the registry; contains no business logic. Cookie session or `Authorization: Bearer <supabase access_token>`. |
| `lib/commands/client.ts`, `use-command-form.ts` | How the UI calls commands. |
| `lib/supabase/server.ts` | RLS-bound client for request paths. |
| `lib/supabase/invites.ts` | Durable staff/customer invitations: RLS-bound claim and membership RPCs surround the sole Auth admin invite call. `private.invite_requests` and an Auth-transaction trigger preserve identity across lost responses; replay never regrants revoked membership. |
| `lib/supabase/admin.ts` | Service-role client. Import restricted by eslint (see rule 4). |
| `lib/brewery.ts`, `app/(app)/brewery-provider.tsx` | Current-brewery resolution and switching across the signed-in user's memberships. |
| `lib/portal.ts` | `getActiveCustomer()`: resolves which customer account the session operates as from `customer_users`, mirroring `lib/brewery.ts`. Redirects to `/login` with no membership. |
| `proxy.ts`, `app/(auth)/` | Session refresh and login. Customer-only accounts (a `customer_users` row, no `brewery_users` row) land on `/portal` instead of `/`. |
| `app/(app)/<area>/` | Staff pages and forms. Thin: read via queries, mutate via commands. |
| `app/(portal)/` | Wholesale customer portal route group (own layout, `/portal` shop + cart, `/portal/orders`, `/portal/invoices`, `/portal/account`) — reads/writes only through the `portal.ts` customer-role commands above. |
| `lib/order-form-rules.ts` | Pure "is the New Order form submittable" rule behind `app/(app)/orders/order-form.tsx` (customer + ship-to or to-location, from-location, one complete line), mirroring `create_order`'s input schema; also supplies the empty-catalog hint. |
| `lib/portal-cart.ts` | Pure decisions behind the portal cart's Save draft/Submit buttons (`app/(portal)/portal/cart.tsx`): which command syncs the cart's current lines (`portal_create_order` vs `portal_update_draft_order`) and when the buttons are disabled. |
| `components/mgr/views/`, `lib/mgr/*-view.ts`, `lib/mgr/fixtures/` | Shared screen drawings, their pure command-payload adapters, and inventory snapshots. Live pages supply existing controlled forms and explicit links; undefined slots keep fixture defaults, null suppresses them. Adapters preserve missing domain facts and do not give fixture frames live route destinations. |
| `lib/mgr/page-query.ts` | Staff server-page query adapter: checks the registry's actual role permission before reading and redirects denied deep links to the existing No access screen. Dedicated mutation pages call its permission guard without executing a write. API/command authorization stays in the registry/RPC. |
| `lib/mgr/not-found.ts` | `orNotFound()`: wraps a detail page's registry read so an unknown or malformed id renders the app's `not-found.tsx` instead of the generic error boundary; shared by `(app)` and `(portal)` detail pages. |
| `lib/chat/` | Provider-neutral chat notification contracts and validation, Chat SDK state, Slack adapter/transport/renderer, OAuth installation and staff linking, job authentication, preview fixtures, and `jobs.ts`, the rule-4 service-role owner. Service access is limited to integration state: OAuth/link lifecycle, callback receipts and action intents, occurrence scan/fan-out, delivery leases/results, App Home reads, destination proofs, and `chat_sdk` cleanup; it never executes domain commands or impersonates staff. |
| `lib/commands/chat.ts`, `lib/commands/today.ts` | Staff chat linking and notification settings; the role-filtered Today projection. |
| `app/api/chat/`, `app/api/webhooks/slack/` | Thin Slack OAuth, scheduled-job, and events/App Home routes that delegate to `lib/chat/`. |
| `app/(app)/settings/chat/` | Admin connection settings, health, linked people and disconnect confirmation; personal preferences for every staff role; read-only link identity preview followed by explicit command consent. `chat-settings-client.tsx` owns forms and the ten provider-free fixture previews. |
| `lib/commands/context.ts`, `lib/auth/request-context.ts` | `buildContext`: the command caller's verified identity and brewery membership; the request-scoped Supabase identity and membership lookups shared by layouts and commands. |
| `lib/env/{public,server,server-parser}.ts` | Runtime configuration: the only Supabase values permitted in browser bundles; the server-only environment singleton; and the parser (incl. optional `VERCEL_ENV`) shared by server code, scripts, and tests. |
| `lib/time-window.ts`, `lib/volume.ts` | Domain display helpers: a stored `hh:mm` window (may wrap midnight) as the string a brewer reads; a stored barrel figure in the unit a brewer reads (storage and TTB stay bbl). |
| `lib/mgr/doc-icons.ts` | The one name → icon map the docs may use (page frontmatter via `lib/source.ts`, landing cards via `<DocIcon />`). |
| `hooks/use-mobile.ts` | shadcn's Sidebar breakpoint hook on `useSyncExternalStore` (one shared MediaQueryList, 768px = Tailwind md). |
| `components/mgr/{frame-persona,screen-width}.tsx` | Design-inventory chrome: the stand-alone frame drawn as the persona in the URL hash; the published inventory's sticky viewport control and the iframe embed it drives. |
| `components/mgr/{date-picker,time-window-field,volume-field}.tsx` | The field components behind `E.edit(…, "date")`, `E.window`, and `E.volume`: calendar date (ISO yyyy-mm-dd), two-thumb time-of-day range, and a volume with a per-instance unit addon. |
| `components/mgr/user-avatar.tsx` | A person's photo for the design inventory only (no avatar column exists; fixtures in `public/mock/*.jpg`). |
| `components/login-form.tsx` | The sign-in card for staff and customers (shadcn `login-03`, minus social login, sign-up and password reset — accounts are invitation-only). |
| `components/ui/` | shadcn primitives. Don't hand-edit; re-add with the shadcn CLI. |
| `components/mgr/` | Product composites over `components/ui`: `app-shell.tsx` (the one staff/portal shell: Sidebar rail at md+, phone tab bar, `PortalShell`), `command-form.tsx` (every mutation form's surface: Sheet on phone, Dialog on desk), `me-sheet.tsx`, `theme-toggle.tsx`, `icon.tsx`/`brand-icons.tsx` (the one Hugeicons wrapper and the QuickBooks/Square/Slack marks), `e.tsx` (the `E.*` vocabulary screens compose), `screens.tsx` (the typed screen inventory — the source of truth for what each MGR screen shows; edit it directly), `venue.tsx`/`venue.css` (the `X`/`S` vocabularies and chrome for the QuickBooks/Square/Slack venue frames, drawn in each product's own design language), `screen-index.tsx`/`screen-explorer.tsx`/`screen-embed.tsx`/`screen-frame.tsx` (render the inventory for the published docs pages below: the long index, the filterable, tappable explorer over `lib/mgr/screen-explorer.ts`, with a persona switch whose demo users, access rule (a record's `permission:` state, else the rail's route roles), landing swap and redrawn Me/Permission denied live only in `lib/mgr/demo-personas.ts` and `components/mgr/demo-screens.tsx` (nothing under `app/` imports them); `ROLE_REPORT=<file> bunx vitest run tests/screen-persona.test.ts` lists the screens whose record claims role-dependent rows but has one drawing and `lib/mgr/screen-links.ts` (label → screen: a record's `to` map, then the portal tier, shell routes, global label rules, exact name; `INERT` names taps that act in place; `tests/tap-coverage.test.ts` fails on any tap that lands nowhere), and the `<Screen name>` embed the customer guides use). Screen authors never touch `components/ui` directly. |
| `lib/mgr/nav.ts`, `lib/mgr/sidebar-state.ts` | Navigation manifests (staff tabs + rail children, portal tabs), role filtering, active-tab resolution; the rail's persisted open state. |
| `app/globals.css`, `app/layout.tsx` | Design tokens (light `:root` / `.dark`), fonts, coarse-pointer target sizes, and the inline theme boot script. |
| `app/(frames)/screens/frame/[s]/` | One screen record rendered full-viewport outside any shell, so `/docs/screens`, `/docs/integrations` and the guides can embed it (the explorer draws screens inline instead) in an iframe at a real viewport width. Statically generated from the inventory; no other route. |
| `tests/` | Proof. Runs against the real local Supabase stack, never mocks. |
| `scripts/seed-dev.ts` | Idempotent dev seed. |
| `content/docs/{index,staff-guide,portal-guide}.mdx` | Customer documentation as Fumadocs MDX, served at `/docs` by `app/(docs)/docs` (`lib/source.ts` is the content index, `components/mdx.tsx` the component set, `app/api/search` the search index); `fumadocs-ui/css/shadcn.css` maps the docs theme onto the app tokens: `index.mdx` is the master audience chooser; staff and portal guides separately cover every available screen and action for their users. Uses customer language only and never exposes implementation phases or internals. |
| `content/docs/{screens,screens-explore,integrations}.mdx` | Generated design-inventory pages in the same Fumadocs tree (`screens.mdx` renders `components/mgr/screen-index.tsx` over `SCREENS` directly, `screens-explore.mdx` the filterable `screen-explorer.tsx`, `integrations.mdx` the venue frames grouped by product) — not hand-written, cannot drift, and deliberately outside `documentation-agent.yml`'s allowlist (`tests/design-docs.test.ts`). |
| `.agents/superpowers/specs/` | Product and schema design decisions (why). |
| `.agents/agents/documentation-maintainer.md`, `.github/workflows/documentation-agent.yml` | Post-merge and manual customer-documentation contract and automation. Claude may edit only the three guide MDX files in a read-only GitHub job whose sandbox deny list is `.github/claude-ci-settings.json` (shared with dreaming); a separate deterministic job validates that bounded diff and maintains the reviewable `documentation/user-guide` pull request. |
| `content/docs/api.mdx`, `lib/mgr/api-operations.ts`, `lib/mgr/api-schema.ts`, `lib/mgr/api-errors.ts` | The HTTP API reference, served at `/docs/api`. Generated blocks (envelope, role matrix, per-area operations with field tables and self-validating curl examples) are written between markers by `bun run docs:api`, deriving available operations from the command registry and designed operations from each screen's declared `reads`/`writes`; `tests/api-docs.test.ts` fails on drift in either direction. |
| `.agents/agents/http-api.md`, `.github/workflows/http-api-agent.yml` | Post-merge HTTP API reference maintenance, mirroring the documentation agent. Claude may edit `api.mdx` prose and a screen's `reads:`/`writes:` annotations only — never hand-write the generated tables (`Bash` is absent from its allowlist; the workflow runs `bun run docs:api`) — and opens the reviewable `docs/http-api` pull request via the MGR App token. |
| `app/icon.svg`, `lib/mgr-icon.ts`, `components/mgr-icon.tsx` | Canonical MGR mark. The SVG is the Next.js favicon; the module owns the path; the component is the in-app reuse. `docs/brand/mgr-github-app-icon.png` is a 1024px raster of the same path for the MGR GitHub App avatar. |
| `.agents/agents/dreaming.md`, `.agents/DRIFT.md`, `.github/workflows/dreaming.yml`, `.github/claude-ci-settings.json` | Daily/manual agent-doc curation and its unresolved read-only drift ledger. Claude edits documents with read-only GitHub access under the shared CI deny list (read from main, not the checked-out dream branch); the workflow validates and publishes through the MGR GitHub App (`mgr[bot]`). |
| `.agents/skills/` | Project-local, harness-compatible agent workflows loaded on demand. |
| `.pi/prompts/` | Thin Pi slash-command aliases; workflow instructions remain owned by the corresponding skill. |
| `.agents/` | This file, agent memory and progress; worktrees live under `.agents/worktrees/`. |

The chat RPC boundary is explicit. Authenticated commands use
`begin_chat_installation`, `begin_chat_reauthorization`,
`disable_chat_installation`, `disconnect_chat_installation`,
`set_brewery_quiet_hours`, `set_personal_notification_destination`,
`set_notification_preference`,
`set_personal_quiet_hours`, `snooze_notification`, `consume_chat_link_proof`,
`unlink_chat_user`, and `set_brewery_operating_defaults`; authenticated reads
use `get_chat_link_intent`, `get_chat_integration_health`, and
`list_chat_user_links`. Never grant `activate_chat_installation` or
`find_chat_oauth_intent` to `authenticated`; never trust a caller
`token_store_key` (activate always stores `slack:installation:<team id>`).
The chat service alone may call `find_chat_oauth_intent`,
`activate_chat_installation`, `mark_chat_installation_reauthorization`,
`reconcile_chat_installation`, `issue_chat_link_proof`, `resolve_chat_actor`,
`scan_chat_notification_occurrences`, `list_chat_scan_targets`,
`lease_chat_deliveries`, `complete_chat_delivery`, `retry_chat_delivery`,
`suppress_chat_delivery`, `record_chat_callback_receipt`,
`claim_chat_callback_receipts`, `complete_chat_callback_receipt`,
`get_chat_home_items`, `get_chat_delivery_context`,
`block_notification_destination`, `issue_chat_action_intent`,
`consume_chat_action_intent`, `set_notification_destination`,
`get_chat_settings_installation`, `chat_credential_has_canonical_owner`,
`has_active_canonical_chat_installation`, `get_chat_installation_lifecycle`,
`chat_settings_request_completed`, and `prune_chat_integration_logs`.
`lib/chat/jobs.ts` calls only those named RPCs — never
`from("chat_installations")`. Private helpers and trigger functions stay
ungranted. Every browser write carries the existing command `requestId`; the
service calls above are limited to integration state and current projections.
Callback receipts, deliveries, and action intents are not pruned
automatically; call `prune_chat_integration_logs` before hosted traffic
(v1 90-day log prune). No scheduler is wired.

## Iron rules

Each rule names what enforces it. If a rule is only enforced by prose, that is
a gap to close, not a convention to trust.

1. **Every domain operation is a command.** All public-schema mutations and
   queries go through `lib/commands/registry.ts` via
   `defineCommand`/`defineQuery` and the single
   endpoint `app/api/command/route.ts` (cookie session or Bearer access token).
   No route handler or page contains
   inline business logic. There is no resource REST API and no API-key table —
   new operations are registered commands, not new routes. Handlers signal user-facing failures by throwing
   `CommandError`; anything else surfaces as a generic 500 with the real error
   logged server-side. Supabase Auth session primitives (sign-up, sign-in/out, magic-link
   exchange, password reset/update, session refresh) are the sole non-domain
   exception; they never authorize direct public-schema access. SaaS tenant
   provisioning is domain work: `provision_brewery` uses the registry’s explicit
   authenticated pre-tenant context and invokes one
   narrow `security definer` RPC for the brewery + first admin membership — never a fake
   `breweryId` or an RLS bypass. AI write tools only propose registered commands;
   an explicit user confirmation is required before execution. *Enforced by:*
   `tests/registry.test.ts` (validation and role checks); structure by review.
2. **`inventory_movements` is append-only.** `UPDATE`/`DELETE` are revoked at
   the database for `authenticated`/`anon`. A correction appends new rows through
   a declared compensating command; there is no generic Undo. A compensation is
   available only when the schema can link it structurally to the original and
   downstream reports preserve the original classification. Compound writes own
   their compensation — a shipped order is corrected through the
   return/credit-memo command, never by reversing one movement.
   `bbl` is computed by trigger from `qty * sku.bbl_per_unit`; callers never
   supply it. *Enforced by:* grants and trigger in `supabase/migrations/`,
   proven by `tests/rls-ledger.test.ts`.
3. **Every tenant table carries `brewery_id` with RLS.** Access derives from
   `brewery_users` / `customer_users` via `my_brewery_ids()`, `is_staff_of()`,
   `staff_role()`, `my_customer_ids()` (the only RLS helpers; defined once in the baseline). Cross-tenant FKs are composite so a row can't reference
   another brewery's data. Portal customers never `SELECT` the `breweries` base
   table (`ttb_registry_no`, `pa_license_no`, `settings` stay staff-only); they
   read `portal_brewery` (`id`, `name`, `timezone`, `portal_fulfillment_location_id`).
   *Enforced by:* RLS policies in migrations, proven by
   `tests/rls-tenancy.test.ts`; `tests/schema-rules.test.ts` reads `pg_catalog`
   to assert RLS on every table, `security_invoker` on every view,
   `search_path` on every function, and an `RLS-EXCEPTION:` comment on any
   permissive policy.
4. **`createAdminClient()` is restricted to `lib/supabase/integration-tokens.ts`,
   `lib/supabase/invites.ts`, and `lib/chat/jobs.ts`.**
   The token boundary is the sole credential path: it admits only `admin`/`sales`,
   proves the concrete connection is visible through `ctx.db`, then passes the
   verified actor to a service-only RPC that rechecks current membership and role
   in the same token read/write statement. Integration modules must use this
   boundary; they never receive a service-client allowlist. `invite_staff` and
   `invite_customer_user` use `lib/supabase/invites.ts`: the RLS-bound claim RPC
   verifies the current actor and role before Auth, and the completion RPC
   rechecks them. Auth identity is bound by a private trigger in Auth's own
   transaction; no client-supplied user id can create membership.
   `lib/chat/jobs.ts` is the one internal-job owner: it serves chat provider
   webhooks and scheduled jobs where no user exists, may call only the named
   `service_role` chat RPCs (`scan_chat_*`, `lease_chat_deliveries`,
   `complete/retry/suppress_chat_delivery`, `claim/complete_chat_callback_receipt`,
   `issue_chat_link_proof`, `resolve_chat_actor`, `reconcile_chat_installation`,
   `activate_chat_installation`, `find_chat_oauth_intent`,
   `mark_chat_installation_reauthorization`, `issue_chat_action_intent`,
   `consume_chat_action_intent`, `set_notification_destination`,
   `get_chat_settings_installation`, `chat_credential_has_canonical_owner`,
   `has_active_canonical_chat_installation`, `get_chat_installation_lifecycle`,
   `chat_settings_request_completed`, `prune_chat_integration_logs`),
   never `from("chat_installations")`, never ordinary domain commands, and
   never mints a user token. Those activate/find RPCs are not granted to
   `authenticated` and must not trust a caller `token_store_key`.
   *Enforced by:* `no-restricted-imports` in `eslint.config.mjs`, run in CI.
5. **Every mutation is one idempotent Postgres transaction.**
   Application roles have no direct table DML. A write handler calls one
   explicitly granted `security definer` RPC (`ctx.db.rpc(...)`) that asserts
   `auth.uid()`-derived tenant/role access, claims the actor/request ID against
   the canonical payload, performs all dependent writes, and stores the result
   before commit. An identical replay returns that result; changed command,
   brewery, or payload conflicts. Private implementation helpers retain the
   multi-row transaction rule and are not application-callable. Per-row
   independent bulk work (CSV import) and the durable
   Auth invitation workflow are the exemptions; each says so
   with an `// atomic-exempt:` comment. MGR v1
   learned this after real data loss
   (`.agents/superpowers/specs/2026-08-31-mgr-v1-review.md`). *Enforced
   by:* `tests/data-api-boundary.test.ts`,
   `tests/command-idempotency.test.ts`, `tests/schema-rules.test.ts`, and
   `tests/write-atomicity.test.ts`.

## Pre-implementation gates

- **Replayable commands are idempotent at the server.** `/api/command` carries
  one stable `requestId` per write action. `private.command_requests` binds it
  to the authenticated actor, brewery, command, and canonical payload, commits
  the first result with the domain effect, returns that result on replay, and
  rejects mismatched reuse. This permits transport retries for current write
  RPCs. It does not by itself enable the AI composer or an offline outbox;
  registry-owned preview/version contracts and explicit eligibility remain
  required below.
- **AI proposals are registry-owned contracts.** The language layer emits
  only a candidate command name + input; an internal registered
  `preview_command` (not AI-exposed) canonicalizes and issues a version token;
  commit revalidates and rejects stale state. The full contract (registry
  fields, loop, attribution, limits) is
  `.agents/superpowers/specs/2026-09-07-mgr-ai-chat-design.md`; plan
  `.agents/superpowers/plans/2026-09-07-ai-chat.md`. This is a design
  prerequisite, not a claim about the current registry.
- **Inventory correction needs durable identity.** The current FG ledger has
  neither a structured reversal link nor sign rules/report semantics for an exact
  opposite entry, so `reverse_inventory_movement` remains disabled.
  Taproom counts now persist headers and explicit bin/SKU/lot UUID-or-null lines,
  including zero-variance counts. Their one-RPC command rejects stale revisions,
  incomplete buckets and overcounts; shortages post exact-bucket depletion with
  frozen BBL. The count UI and count correction remain pending.
- **Auth invitations use a durable external-write workflow.** One canonical
  command request claims a private invitation. Auth's first `invited_at` write
  binds its user id in that same transaction using an invitation token and
  matching email; mutable user metadata alone cannot create membership.
  Completion locks the invitation and atomically creates membership and marks
  complete. Tests force both lost Auth responses and real membership failures
  for staff and customers. Completed retries return the original user id without
  restoring revoked access. Existing Auth emails are refused; attaching existing
  accounts needs a separate consent workflow. Team, first-run, and customer detail
  share invitation forms that retain request identity for an unchanged failed
  submission while the page remains open.
- **CSV exemption stops between logical rows.** `import_csv` may continue after
  one independent CSV row fails, but dependent writes inside a logical row still
  require one Postgres function. `begin_csv_import` binds the complete batch
  manifest to its request;
  `import_csv_row` commits each logical row and its durable committed or blocked
  outcome. Exact reruns return original results, including opening movement IDs.
  Corrected batches contain only blocked rows. Proven by `tests/commands-import.test.ts`;
  the wizard preserves batch identity while its page stays open.

## Schema conventions

Append-only ledgers over mutable counters; triggers for derived values;
no status columns that won't be kept accurate. Full rationale:
`.agents/superpowers/specs/2026-08-31-mgr-schema-decisions.md`.

RLS predicates are index-backed: every table whose policy filters on
`brewery_id` has an index whose first column is `brewery_id` (a unique
constraint or query index leading with it counts). Policies call
`(select auth.uid())`, never bare `auth.uid()`, so the lookup runs once per
statement instead of once per row. *Enforced by:*
`tests/schema-rls-indexes.test.ts` (from `docs/audits/2026-09-05/security.md`).
