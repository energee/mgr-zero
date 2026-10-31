# Architecture

Ownership map and iron rules for MGR. `AGENTS.md` routes here; `README.md`
covers setup. When a concept needs changing, change it at its owner below —
never copy it into a second place.

## Ownership

| Path | Owns |
| --- | --- |
| `supabase/migrations/*.sql` | Schema, RLS policies, triggers, grants, and the transactional command-request ledger. The only source of truth for data rules. Every file is immutable once committed — `supabase db push` applies a version once and never rereads it, so a schema change is a new migration and `supabase/migrations.lock.json` pins the rest (see `.agents/superpowers/specs/2026-08-31-mgr-schema-decisions.md`). Application roles have read-only table access; every mutation enters through an explicitly granted, idempotent `security definer` RPC with `search_path = ''`, database-derived actor/tenant/role checks, and a canonical request hash. Private helpers and implementation functions are not executable by application roles. |
| `lib/commands/registry.ts` | `defineCommand` / `defineQuery`, `Ctx`, role checks, `CommandError`. Every domain operation the app performs is registered here. |
| `lib/commands/<area>.ts` | Business logic per area (catalog, inventory, orders, customers, portal; `import.ts` owns independent, atomic CSV rows with durable batch and row outcomes). Handlers read through the RLS-bound `ctx.db`; public-schema writes call the narrow RPC boundary and forward `CommandExecution.requestId`. `orders.ts` owns order lifecycle (create/submit/confirm/adjust/cancel), allocations, pick/ship, per-shipment invoices, credit memos, and replenishment. `customers.ts` owns customer/ship-to/price-list CRUD and the portal fulfillment source. `catalog.ts` owns products, SKUs, locations and their bins (`list_bins`, `create_bin`, `update_bin`, `delete_bin`); `inventory.ts` owns the movement ledger at bin grain (`record_movement` needs a `binId`; `get_bin_on_hand`). `portal.ts` owns the customer-role commands, including `portal_create_order`, `portal_update_draft_order`, `portal_submit_order`, `portal_quote_order`, `portal_submit_quote`, `portal_catalog`, `portal_schedule`, `portal_orders`, `portal_order`, `portal_invoices`, `portal_invoice`, `raise_invoice_question`, and `get_portal_account` — the only commands a `customer` role may call. |
| `lib/commands/purchasing.ts` | Vendors, materials, contracts, purchase orders (create/send/receive/cancel/close-short), material requirements/planning, and material counts. `send_purchase_order` is an attestation (`sent_via` mailto/external, never `direct` until a provider is approved) — transport is a property, never a `po_status` fork. Lead time is an observed, never-stored vendor view (`ordered_on → received_on`); a contract's remaining commitment is four numbers (committed, received, on order, available). |
| `lib/commands/packaging.ts` | Packaging runs: schedule (brand-first, no tank required), start against one exact source occupancy, close (lot + output movements + BOM consumption, first-expiring-first for lot-tracked materials), and repack (breakdown only, admin/warehouse). |
| `lib/commands/delivery.ts` | Delivery routes: `save_route` (header + stops replaced in one call), `depart_route`, `leave_delivery_for_later`, `return_route`, `get_delivery_stop`. A departed route is frozen to replanning; an unattempted open stop can leave through `leave_delivery_for_later`, and return waits until no open stop remains. |
| `lib/commands/transfers.ts` | Internal bin-to-bin and cross-location `stock_transfers` (create, which submits; pick/receive/cancel) — a document distinct from priced customer `orders`; bin-to-bin moves inside one location are structurally barred from becoming deliveries. |
| `lib/commands/landings.ts`, `lib/commands/search.ts`, `lib/commands/settings.ts`, `lib/commands/tenancy.ts` | The Beer/Work/More landing aggregates; the Beer landing's below-par count and signed customer-keg sum belong to the caller-RLS-bound `get_beer_overview_aggregates` SQL RPC, with other counts still parallel and the taproom stock branch unchanged; cross-entity `search_entities` (parallel per-entity RLS-bound reads, not a definer function — RLS already decides the rows); brewery settings (`update_brewery`); the pre-tenant `provision_brewery` caller. |
| `lib/commands/invites.ts` | Staff roster read; customer portal membership (`list_customer_users`, and `revoke_customer_user` for Admin or Sales); `update_staff_role` and `revoke_staff` (Admin only, always keeps one admin); staff/customer invitations, pending invitation resend/revoke, and pre-tenant invitation acceptance. Delegates Auth invitation delivery to `lib/supabase/invites.ts`. |
| `lib/commands/qbo.ts` | QuickBooks Online: OAuth connect/disconnect, customer/item mapping, invoice push and payment sync, and issued-token revoke on a failed OAuth completion. |
| `lib/commands/taproom.ts` | Keg pools/events, durable explicit-bucket taproom counts, and tap interval reads plus atomic tap/kick/swap RPCs. Intervals freeze nominal size, never write inventory, and keep guest identity separate from own SKUs absent stock. Completed-period brand variance reads count-owned frozen sold depletion (with destruction reported separately) against immutable `pos_sale_expectations`; the draft projection reads expected consumption from the latest durable count through its server as-of without posting inventory or allocating lots. Both reuse `private.taproom_pos_allocations`; `pos_sales_coverage` records explicit source/location observation windows. `private.reconcile_pos_sale` owns first serving interpretation of raw order/line facts, with no application or service execute grant until the provider owner lands. |
| `lib/commands/production.ts` | Recipe, batch, vessel, cellar and fermentation operations. Batch completion previews and commits one database-owned formula over all batch occupancies, frozen closed-run output movements, transfers and typed adjustments; completion accepts no caller amount or classification. |
| `lib/commands/compliance.ts` | Compliance registry, lot trace, generated and immutable filed reports, and completion-loss review. Loss reattribution allocates one exact part of a completion root through a frozen append-only signed pair; report removal totals include it once, while the cellar breakdown is explanatory. Direct cellar Taproom volume files under its frozen Taproom tax treatment (#816). |
| `lib/commands/all.ts` | The one side-effecting import that registers every command module. |
| `app/api/command/route.ts` | The single HTTP entry point. Dispatches to the registry; contains no business logic. Cookie session or `Authorization: Bearer <supabase access_token>`. |
| `lib/commands/admission.ts` | `consumeAdmission` / `requireAdmission`: the per-user request budget (`consume_command_admission`) shared by `/api/command`, Ask MGR `/api/chat`, and the authenticated portal invoice-payment broker; fails closed with 503 and returns a whole-second retry for the caller's 429. `get_cola_image` checks admission inside its authorized handler only on a cache miss; serving a stored label does not spend budget. The payment broker authorizes its invoice before admission and uses the existing unavailable redirect on denial. |
| `app/(portal)/portal/invoices/[id]/pay/route.ts` | Customer payment broker: reads a persisted provider bearer link only after authorizing the active customer invoice, then opens the allowlisted provider URL in a new tab without exposing it to the portal. Its shared POST form uses `rel="noopener"`, not `noreferrer`, to retain a verifiable Origin; the dedicated Next header rule keeps `Referrer-Policy: no-referrer` before any external redirect. An unavailable link returns the invoice’s generic `payment=unavailable` status. Same-origin redirects use canonical `APP_URL`, never request Host. |
| `lib/commands/client.ts`, `use-command-form.ts` | How the UI calls commands. |
| `lib/supabase/server.ts` | RLS-bound client for request paths. |
| `lib/supabase/invites.ts` | Durable staff/customer invitations: RLS-bound claim and membership RPCs surround the sole Auth admin invite call. `private.invite_requests` and an Auth-transaction trigger preserve identity across lost responses; replay never regrants revoked membership. |
| `lib/supabase/provision.ts` | Brewery bootstrap (#467). Calls only the service-only `provision_brewery` RPC with the session-verified actor, after `lib/commands/tenancy.ts` has refused a dedicated deployment. |
| `lib/supabase/public-menu.ts` | Server-only website menu reader. It may call only the service-only `get_published_pos_menu` RPC, whose opaque public id and fixed safe projection expose explicitly published current rows without granting anonymous access to tenant tables. The route hashes that stable projection into its public content version and ETag and applies one CORS policy to success, conditional, missing, and failure responses. |
| `lib/supabase/cola-label-images.ts` | Writes MGR's copy of a saved COLA label through the service-only `store_cola_label_image`, after `get_cola_image` authorized the caller, admitted the cache miss, and fetched the permit-checked label from TTB. Staff read copies through `get_stored_cola_label_image` without spending command admission; no client supplies the bytes. |
| `lib/pos.ts`, `lib/commands/pos.ts`, `lib/supabase/integration-tokens.ts` | Square transport, registered POS operations, and the credential boundary. Catalog publication owns one durable Square parent item per brand, premise, and menu group; poured formats are its variation identities. A location publish freezes its complete sorted brand manifest and atomically reserves every child attempt under the same per-brand locks used by standalone item publication before the first provider write, including prior-owned brands that now need retirement. Each item attempt freezes its exact request body, provider idempotency key, source variations, expected item/variation versions, credential generation, committed catalog generation, and owned or explicitly adopted identity. A sales mapping never grants write ownership or supplies a provider identity; existing provider objects become writable only through durable MGR ownership or an explicit adoption verified against an observed mapped variation. Adoption of a format that already has durable ownership must name that same variation identity or fail before an attempt is recorded. Unknown outcomes replay that body; exact menu replay traverses only its saved manifest; known version conflicts require a new current-object snapshot. A definitive child rejection terminally records the menu's completed, rejected, and superseded child outcomes so corrected work can start, while an uncertain child keeps the manifest recoverable. The catalog generation advances atomically with a successful snapshot commit, which supersedes unresolved publication derived from the prior committed snapshot; publication admission is blocked while a newer current-seller catalog fetch is unfinished, including its credential-refresh handoff, and captures the committed generation after that sync settles. OAuth reconnect terminally settles unresolved catalog work before installing its new credential; safe different-seller replacement also clears current publication ownership while retaining event history. A newer credential or catalog generation terminally supersedes unresolved publication work, and definitive missing or malformed owned provider objects reject their attempts. The publication lease admits current Admin or Warehouse only for its concrete durable attempt, refreshes an expired access credential through the same credential CAS, and terminally settles current-generation publication if Square rejects its authorization. Losing an eligible role terminally settles that actor's unfinished manifest and children as `role_changed`, so another current Admin or Warehouse operator can begin corrected work while the original audit remains immutable. |
| `lib/supabase/admin.ts` | Service-role client. Import restricted by eslint (see rule 4). |
| `lib/brewery.ts`, `lib/brewery-provider.tsx` | Current-brewery resolution and switching across the signed-in user's memberships. The provider is the client half the layouts mount; it lives in `lib` because `lib` never imports a route directory under `app/` (`tests/boundary.test.ts`). |
| `lib/portal.ts` | `getActiveCustomer()`: resolves which customer account the session operates as from `customer_users`, mirroring `lib/brewery.ts`. Signed-out requests go to `/portal/login`; signed-in accounts without customer membership go to `/no-membership`. |
| `proxy.ts`, `app/(auth)/` | Session refresh and login. Customer-only accounts (a `customer_users` row, no `brewery_users` row) land on `/portal` instead of `/`. |
| `app/(app)/<area>/` | Staff pages and forms. Thin: read via queries, mutate via commands. |
| `app/(portal)/` | Wholesale customer portal route group (own layout, `/portal` shop + cart, `/portal/coming-up`, `/portal/orders`, `/portal/invoices`, `/portal/account`) — reads/writes only through the `portal.ts` customer-role commands above, including quote/submit, schedule, account, and invoice-detail operations. |
| `lib/order-form-rules.ts` | Pure "is the New Order form submittable" rule behind `app/(app)/orders/order-form.tsx` (customer + ship-to or to-location, from-location, at least one complete line and no partially entered or invalid lines; only wholly blank spare rows are omitted), mirroring `create_order`'s input schema; also supplies the empty-catalog hint. |
| `lib/portal-cart.ts` | Pure decisions behind the portal cart's Save draft/Submit buttons (`app/(portal)/portal/cart.tsx`): which command syncs the cart's current lines (`portal_create_order` vs `portal_update_draft_order`) and when the buttons are disabled; also the unsaved new cart kept in localStorage for 7 days per buyer, customer account and brewery (#710), separate from exact-request recovery in sessionStorage. |
| `lib/keg-deposits.ts` | Pure: `kegDepositRows` joins `keg_customer_balances` and `keg_deposit_balances` per customer × pool × size and flags a mismatch only once a deposit was refunded and kegs on deposit differ from kegs out plus kegs lost at that customer. The deposit refund and Returned shell event remain separate ledger records. `return_shipment` can write both atomically for an empty-keg refund; refund-only and manual return operations still reconcile here for Customer keg balance and Keg report. |
| `components/mgr/views/`, `lib/mgr/*-view.ts`, `lib/mgr/fixtures/` | Shared screen drawings, their pure command-payload adapters, and inventory snapshots. Live pages supply existing controlled forms and explicit links; undefined slots keep fixture defaults, null suppresses them. Adapters preserve missing domain facts and do not give fixture frames live route destinations. `lib/mgr/screen-routes.ts` anchors routed screens at their public `page.tsx` entries, then parity checks follow thin adapters to the shared drawing; header/dialog-only screens name their mounted component. |
| `lib/mgr/page-query.ts` | Staff server-page query adapter: checks the registry's actual role permission before reading and redirects denied deep links to the existing No access screen. Dedicated mutation pages call its permission guard without executing a write. API/command authorization stays in the registry/RPC. |
| `lib/mgr/not-found.ts` | `orNotFound()`: wraps a detail page's registry read so an unknown or malformed id renders the app's `not-found.tsx` instead of the generic error boundary; shared by `(app)` and `(portal)` detail pages. |
| `lib/email/jobs.ts`, `lib/email/transport.ts` | Buyer order-confirmation delivery. The confirmation transaction snapshots linked customer users and order facts in private delivery rows. Only the email job service boundary leases and finishes those rows; it sends immutable Resend requests within their deduplication window. `get_order_email_status` exposes tenant-authorized Admin/Sales diagnostics. |
| `lib/chat/` | Provider-neutral chat notification contracts and validation, Chat SDK state, Slack adapter/transport/renderer, OAuth installation and staff linking, job authentication, preview fixtures, and `jobs.ts`, the rule-4 service-role owner. Service access is limited to integration state: OAuth/link lifecycle, callback receipts and action intents, occurrence scan/fan-out, delivery leases/results, App Home reads, destination proofs, and `chat_sdk` cleanup; it never executes domain commands or impersonates staff. |
| `lib/commands/chat.ts`, `lib/commands/today.ts` | Staff chat linking and notification settings; the role-filtered Today projection. |
| `app/api/chat/`, `app/api/webhooks/slack/` | Thin Slack OAuth, scheduled-job, and events/App Home routes that delegate to `lib/chat/`. |
| `app/(app)/settings/chat/` | Admin connection settings, health, linked people and disconnect confirmation; personal preferences for every staff role; read-only link identity preview followed by explicit command consent. `chat-settings-client.tsx` owns forms and the ten provider-free fixture previews. |
| `lib/commands/context.ts`, `lib/auth/request-context.ts` | `buildContext`: the command caller's verified identity and brewery membership; the request-scoped Supabase identity and membership lookups shared by layouts and commands. A command reads its role array (`staffRolesAt`: one `brewery_users` row, shared by the cookie and bearer paths, each rejecting a non-UUID brewery as not_member first); pages read full memberships with the `staff_brewery` name and timezone (`getActiveBrewery`), and a later `getStaffRoles` reuses them. |
| `lib/env/{public,server,server-parser}.ts` | Runtime configuration: the only Supabase values permitted in browser bundles; the server-only environment singleton; and the parser (incl. optional `VERCEL_ENV`, and `readAppUrl` — the public origin for links and OAuth redirects, never taken from a request Host) shared by server code, scripts, and tests. |
| `lib/commands/movement-input.ts` | `movementInput`, the `record_movement` command's input schema. It registers no command, so the client-side Composer can import it; `lib/commands/inventory.ts`, `lib/commands/preview.ts`, and the inventory page share it. |
| `lib/composer/state.ts` | The Composer drawer's `record_movement` proposal: the `composerProposal` schema that `lib/chat/messages.ts` parses the newest assistant message's proposal against. A malformed or non-movement proposal returns an operator error instead of reaching the commit button. |
| `lib/ttb/colas.ts` | TTB's public COLA registry client: searches by permit, parses details and discovers label attachments. `search_colas`, `get_cola_details`, and `get_cola_image` in `lib/commands/compliance.ts` own access. Image reads verify approval, permit and attachment membership, then return bounded image data through a fresh TTB session. Bundles TTB's missing intermediate certificate. Catalog's bulk review explicitly saves the chosen attachment identifier on `brand_approvals.image_url` through `upsert_brand_approval`; attachment URLs cannot render without the TTB session. |
| `lib/compliance-period.ts` | Compliance reporting periods as URL keys (month `YYYY-MM`, quarter `YYYY-Qn`, year `YYYY`): their date ranges and labels, shared by the compliance pages and `lib/commands/compliance.ts`. |
| `lib/time-window.ts`, `lib/volume.ts` | Domain display helpers: a stored `hh:mm` window (may wrap midnight) as the string a brewer reads; a stored barrel figure in the unit a brewer reads (storage and TTB stay bbl), including `saleVolume` — a shipped line's two-decimal bbl removal total, which `formatVolume` would round to a glyph — and the raw-figure formatters `bblFixed` (two-decimal, TTB report precision) and `bblExact` (stored precision, for variance, loss, and previews). |
| `lib/hash.ts` | `sha256` hex digests and `oauthState`, the server-generated 256-bit OAuth secret the QBO, Square, and Slack starts share. Only the hash is stored. Retrying a pending start rotates its digest without creating a second intent or extending expiry; only the latest URL works. |
| `lib/mgr/money.ts` | Cents as text: `money` for anything an operator reads (thousands separators, a true minus sign on a credit) and `dollarsInput` for the text of a dollars field; `toCents` turns that field back into integer cents (empty is undefined). An eslint `no-restricted-syntax` rule rejects a local `(cents / 100).toFixed(2)` everywhere else; `lib/qbo.ts` is exempt because its decimal string is a wire value, not a display. |
| `lib/mgr/labels.ts`, `lib/mgr/tax-treatments.ts`, `lib/mgr/enums.ts` | How stored enum values read (`sentenceCase`, import kinds) and which values exist: the sale-channel tax treatments, and the keg and production option arrays the pickers draw. `enums.ts` imports nothing, so a `"use client"` form or a shared view under `components/mgr/views/` can read an option list without importing a `lib/commands/<area>.ts` module and registering every command in it; those modules re-export from here so the zod schemas and the pickers stay one list (`tests/boundary.test.ts`). |
| `lib/mgr/roles.ts` | Shared role-set predicates: `hasAnyRole` tests overlap against an explicit allowed list, including Admin where permitted; `onlyRoles` is true only for a nonempty set held entirely within the excluded roles. Staff permissions and navigation are the union of the held roles. Portal customer membership remains separate. Canonical staff role order is `STAFF_ROLES` in `lib/mgr/enums.ts`. |
| `lib/mgr/doc-icons.ts` | The one name → icon map the docs may use (page frontmatter via `lib/source.ts`, landing cards via `<DocIcon />`). |
| `hooks/use-mobile.ts` | shadcn's Sidebar breakpoint hook on `useSyncExternalStore` (one shared MediaQueryList, 768px = Tailwind md). |
| `components/mgr/{frame-persona,screen-width}.tsx` | Design-inventory chrome: the stand-alone frame drawn as the persona in the URL hash; the published inventory's sticky viewport control and the iframe embed it drives. |
| `components/mgr/{date-picker,time-window-field,volume-field}.tsx` | Shared calendar date (ISO yyyy-mm-dd), two-thumb time-of-day range, and volume with a per-instance unit addon. `E.edit(…, "date")` uses DatePicker; screen views import TimeWindowField and VolumeField directly. |
| `components/mgr/{qty,palette}.tsx` | Screen views import Qty for a labeled quantity with a unit addon and Palette for grouped search results. VolumeField composes Qty with TabBar; `E.edit` and `E.stq` use StepQuantity, and `E.tabs` uses TabBar. |
| `components/mgr/user-avatar.tsx` | Generated geometric avatars for the design inventory only (no live avatar column; synthetic JPEG fixtures in `public/mock/`). |
| `components/login-form.tsx` | The sign-in card for staff and customers (shadcn `login-03`, minus social login and sign-up — accounts are invitation-only). Forgot password opens `/reset`. |
| `components/ui/` | shadcn primitives. Don't hand-edit; re-add with the shadcn CLI. |
| `components/mgr/` | Product composites over `components/ui`: `app-shell.tsx` (the one staff/portal shell: Sidebar rail at md+, phone tab bar, `PortalShell`), `command-form.tsx` (every mutation form's surface: Sheet on phone, Dialog on desk), `me-sheet.tsx`, `theme-toggle.tsx`, `icon.tsx`/`brand-icons.tsx` (the one Hugeicons wrapper and the QuickBooks/Square/Slack marks), `e.tsx` (the `E.*` vocabulary screens compose), `screens.tsx` (the typed screen inventory — the source of truth for what each MGR screen shows; edit it directly), `venue.tsx`/`venue.css` (the `X`/`S` vocabularies and chrome for the QuickBooks/Square/Slack venue frames, drawn in each product's own design language), `screen-index.tsx`/`screen-explorer.tsx`/`screen-embed.tsx`/`screen-frame.tsx` (render the inventory for the published docs pages below: the long index, the filterable, tappable explorer over `lib/mgr/screen-explorer.ts`, with a persona switch whose demo users, access rule (a record's `permission:` state, else the rail's route roles), landing swap and redrawn Me/Permission denied live only in `lib/mgr/demo-personas.ts` and `components/mgr/demo-screens.tsx` (nothing under `app/` imports them); `ROLE_REPORT=<file> bunx vitest run tests/screen-persona.test.ts` lists the screens whose record claims role-dependent rows but has one drawing and `lib/mgr/screen-links.ts` (label → screen: a record's `to` map, then the portal tier, shell routes, global label rules, exact name; `INERT` names taps that act in place; `tests/tap-coverage.test.ts` fails on any tap that lands nowhere), and the `<Screen name>` embed the customer guides use). Views import shadcn parts from `components/ui` directly; `E` keeps only MGR vocabulary that adds behavior or domain meaning, never a wrapper around one shadcn part (#909). |
| `lib/mgr/nav.ts`, `lib/mgr/sidebar-state.ts` | Navigation manifests (staff tabs + rail children, portal tabs), role filtering, active-tab resolution, browser-tab titles (`navTitle` uses named subpage headings before the section label; record-specific metadata reuses request-cached authorized page reads; `tests/record-page-titles.test.ts` exercises actual metadata behavior and dynamic record coverage); the rail's persisted open state. |
| `app/globals.css`, `app/layout.tsx` | Design tokens (light `:root` / `.dark`), fonts, coarse-pointer target sizes, and the inline theme boot script. |
| `app/(frames)/screens/frame/[s]/` | One screen record rendered full-viewport outside any shell, so `/docs/screens`, `/docs/integrations` and the guides can embed it (the explorer draws screens inline instead) in an iframe at a real viewport width. Statically generated from the inventory; no other route. |
| `tests/` | Proof. Runs against the real local Supabase stack, never mocks. |
| `scripts/seed-dev.ts` | Idempotent dev seed. |
| `content/docs/{index,staff-guide,portal-guide}.mdx` | Customer documentation as Fumadocs MDX, served at `/docs` by `app/(docs)/docs` (`lib/source.ts` is the content index, `components/mdx.tsx` the component set, `app/api/search` the search index); `fumadocs-ui/css/shadcn.css` maps the docs theme onto the app tokens: `index.mdx` is the master audience chooser; staff and portal guides separately cover every available screen and action for their users. Uses customer language only and never exposes implementation phases or internals. |
| `content/docs/{screens,screens-explore,integrations}.mdx` | Generated design-inventory pages in the same Fumadocs tree (`screens.mdx` renders `components/mgr/screen-index.tsx` over `SCREENS` directly, `screens-explore.mdx` the filterable `screen-explorer.tsx`, `integrations.mdx` the venue frames grouped by product) — not hand-written, cannot drift, and deliberately outside `documentation-agent.yml`'s allowlist (`tests/design-docs.test.ts`). |
| `.agents/superpowers/specs/` | Product and schema design decisions (why). |
| `.agents/agents/documentation-maintainer.md`, `.github/workflows/documentation-agent.yml` | Post-merge, weekly, and manual customer-documentation contract and automation. Claude may edit only the three guide MDX files, plus `README.md` and the `docs/` pages the change added, to integrate newly added Markdown, in a read-only GitHub job whose sandbox deny list is `.github/claude-ci-settings.json` (shared with dreaming); a separate deterministic job validates that bounded diff and maintains the reviewable `documentation/user-guide` pull request. What the agent overlooked but may not fix is listed in one `Docs gaps: documentation agent` issue by `scripts/file-doc-findings.sh` in a separate `report` job. |
| `content/docs/api/` (index plus one page per area), `lib/mgr/api-operations.ts`, `lib/mgr/api-schema.ts`, `lib/mgr/api-errors.ts` | The HTTP API reference, served at `/docs/api`. Generated blocks (envelope, role matrix, per-area operations with field tables and self-validating curl examples) are written between markers by `bun run docs:api`, deriving available operations from the command registry and designed operations from each screen's declared `reads`/`writes`; `tests/api-docs.test.ts` fails on drift in either direction. |
| `.github/workflows/doc-agent-watch.yml` | Opens one GitHub issue per problem when Dreaming, the documentation agent, the HTTP API agent or `hosted jobs` fails, or when no `dream:` commit lands on main for 3 days. |
| `.agents/agents/http-api.md`, `.github/workflows/http-api-agent.yml` | Post-merge and weekly HTTP API reference maintenance, mirroring the documentation agent; a PR body with `API: none` skips it. Claude may edit the `content/docs/api/*.mdx` prose and a screen's `reads:`/`writes:` annotations only — never hand-write the generated tables (`Bash` is absent from its allowlist; the workflow runs `bun run docs:api`) — and opens the reviewable `docs/http-api` pull request via the MGR App token. |
| `app/icon.svg`, `lib/mgr-icon.ts`, `components/mgr-icon.tsx` | Canonical MGR mark. The SVG is the Next.js favicon; the module owns the path; the component is the in-app reuse. `docs/brand/mgr-github-app-icon.png` is a 1024px raster of the same path for the MGR GitHub App avatar. |
| `.agents/agents/dreaming.md`, `.agents/DRIFT.md`, `.github/workflows/dreaming.yml`, `.github/claude-ci-settings.json` | Daily/manual agent-doc curation and its unresolved read-only drift ledger, including linking newly added or unlinked specs, plans, and runbooks (specs and plans stay read-only). Claude edits documents with read-only GitHub access under the shared CI deny list (read from main, not the checked-out dream branch); the workflow validates and publishes through the MGR GitHub App (`mgr[bot]`); documentation gaps it may not fix are listed in one `Docs gaps: dreaming agent` issue by `scripts/file-doc-findings.sh`. |
| `.agents/skills/` | Project-local, harness-compatible agent workflows loaded on demand. |
| `.pi/prompts/` | Pi slash commands. `http-api.md` is a thin alias that loads `.agents/agents/http-api.md`; `simplify.md` is a self-contained prompt. |
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
   `staff_roles()` / `has_staff_role()` (the role-array helpers from #797),
   `my_customer_ids()` and `my_staff_brewery_ids(roles)`. Staff membership stores a
   nonempty canonical array; authorization uses overlap with explicitly allowed
   roles, not a primary role. Cross-tenant FKs are composite so a row can't reference
   another brewery's data. Portal customers never `SELECT` the `breweries` base
   table (`ttb_registry_no`, `settings` stay staff-only); they
   read `portal_brewery` (`id`, `name`, `timezone`, `portal_fulfillment_location_id`).
   Staff and customers share one table grant, so the same holds for
   `invoices`, `order_events`, `shipments` and `deliveries` (#754): no customer
   policy on the base table; buyers read the `portal_invoices`,
   `portal_order_events`, `portal_shipments` and `portal_keg_deposits`
   projections, which omit QBO sync bookkeeping, write-off attribution, event
   payloads and staff ids (deliveries have no portal projection).
   `orders`, `order_lines`, `order_deposit_lines` and `skus` follow the same
   rule (#788). Buyers read `portal_orders`: only the columns
   `portal_order_rows` returns, with ship-to and lines inlined. Buyers read
   `portal_sku_prices`: active, priced SKUs on the caller's channels, with no
   QBO mapping. `order_deposit_lines` has no portal projection. `sku_prices`
   returns no customer rows, because it is `security_invoker` over `skus`.
   A definer projection is never inlined, so a filter on its view runs after
   every caller row is built; single-row reads pass an id to the rows function
   instead (`portal_order_rows(p_order)`).
   Buyers read customer identity through `portal_customers` (`id`,
   `brewery_id`, `name`, `sale_channel_id`). Membership discovery uses this
   projection too, not a base-table embed. `customers`, `brands`, `formats`
   and `channel_prices` have no customer SELECT policies (#793).
   QuickBooks customer reconciliation adds nine `customers` columns (billing
   email, phone, five billing-address parts, `qbo_sync_token`, `qbo_sync_state`)
   and the `qbo_customer_snapshots` and `qbo_customer_decisions` tables. The
   tables are readable by admin and sales only; no application role (including
   service_role) has a write or service-read grant, so tests seed and read them
   with privileged SQL. A unique index allows one QuickBooks customer per MGR
   customer within a brewery and realm; legacy rows with a NULL realm sit
   outside that uniqueness. The new `customers` columns are not admin/sales
   only: warehouse already reads whole `customers` rows (`list_customers` and
   `get_customer` select `*`) through the existing staff policy, so it sees
   these columns too. That is inherited access, not a new role grant. A buyer
   cannot read them: the customer policy on `customers` is gone (#793).
   Customer, order, invoice, price and compliance reads admit only the staff
   roles of the commands that read them, via
   `brewery_id in (select my_staff_brewery_ids(array[...]))`; a brewer gets none
   of them (#770). Every other staff policy uses the same form. No policy calls
   a SECURITY DEFINER helper such as `is_staff_of` or `taproom_can` per row:
   the helper cannot be inlined, so it runs once per other brewery's row
   (#1102, #1198). Taproom access is the `taproom` role in that array, plus
   the taproom-location filter on `locations`, `bins` and `taproom_pars`.
   `tests/staff-roles-schema.test.ts` enforces it. `tests/rls-taproom.test.ts`
   checks sales, warehouse and brewer against each table's command role list.
   Staff `on_hand` balances aggregate the RLS-bound movement ledger directly so
   brewery/SKU/location predicates push below aggregation (#1643). Only taproom-only
   memberships use `taproom_on_hand_rows`, which exposes taproom-use location
   quantities without granting raw history. Mixed-role memberships use the staff
   branch once. `atp` sums movements and negative open allocations at SKU grain.
   `keg_bin_on_hand_rows` still resolves memberships once per query (#756).
   *Enforced by:* RLS policies in migrations, proven by
   `tests/rls-tenancy.test.ts`, `tests/rls-portal-columns.test.ts` and `tests/rls-portal-order-columns.test.ts`; `tests/schema-rules.test.ts` reads `pg_catalog`
   to assert RLS on every table, `security_invoker` on every view,
   `search_path` on every function, and an `RLS-EXCEPTION:` comment on any
   permissive policy.
4. **`createAdminClient()` is restricted to `lib/supabase/integration-tokens.ts`,
   `lib/supabase/invites.ts`, `lib/supabase/provision.ts`, `lib/supabase/public-menu.ts`,
   `lib/supabase/cola-label-images.ts`,
   `lib/chat/jobs.ts`, `lib/email/jobs.ts`, and `lib/retention/jobs.ts`.**
   The token boundary is the sole credential path: each operation admits only its named roles,
   proves the concrete connection is visible through `ctx.db`, then passes the
   verified actor to a service-only RPC that rechecks current membership and role
   in the same token read/write statement. Integration modules must use this
   boundary; they never receive a service-client allowlist. `invite_staff` and
   `invite_customer_user` use `lib/supabase/invites.ts`: the RLS-bound claim RPC
   verifies the current actor and role before Auth, and the completion RPC
   rechecks them. Auth identity is bound by a private trigger in Auth's own
   transaction; no client-supplied user id can create membership.
   Portal quote tax refresh uses the service-only `read_portal_quote_tax_tokens`,
   `lease_portal_quote_tax_refresh`, `cas_portal_quote_tax_tokens`, and
   `mark_portal_quote_tax_authorization_failed` RPCs. Reads and new leases require
   an unexpired pending quote, customer membership, and the original connected
   company. A refresh holder may store rotated credentials or mark recovery after
   quote expiry using its random lease capability and immutable quote identity.
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
   `lib/supabase/provision.ts` may call only `provision_brewery`, which is
   `service_role` only (#467): the pre-tenant command refuses a dedicated
   deployment (`MGR_DEDICATED=1`, which the database cannot read), then passes
   the session-verified actor; the RPC rechecks the account exists.
   `lib/supabase/public-menu.ts` may call only `get_published_pos_menu`; that
   service-only function accepts an opaque public id and returns location name,
   safe labels, prices, serving sizes, and availability for rows
   explicitly published to the website. It cannot expose tenant or provider ids.
   `lib/supabase/cola-label-images.ts` may call only `store_cola_label_image`,
   from `get_cola_image` after the command admitted the caller and TTB returned
   the permit-checked label; the function keeps only labels saved on an approved
   COLA and never replaces a stored copy, so no client can supply the bytes.
   `lib/email/jobs.ts` may call only `lease_order_emails` and
   `finish_order_email`. These service-only RPCs expose frozen confirmation
   deliveries, check recipient membership, and require the current lease token
   when recording provider outcomes. The job cannot execute domain commands.
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

- **A page asks the query for the rows it wants.** When a page needs a subset —
  taprooms, warehouses, open orders — the filter is an input on the registered
  query and Postgres applies it (`list_locations` takes `use`). Reading
  everything and narrowing it in the page spends the row cap on rows the caller
  discards, and copies the domain rule into every page that asks. A predicate
  repeated across pages (`l.kind === "taproom"`, `l.uses.includes("taproom")`)
  is the signal that the query is missing an input, not that the pages need a
  shared helper. The same reflex applies when one column becomes many (a `kind`
  that becomes a set of `uses`): change the question the query answers, then
  let the callers ask it. The exception is a page that needs the whole list
  anyway — `/settings` prints every location and offers the warehouses — where
  a second filtered read is a round trip for rows already in hand, so derive
  the subset from the list you fetched.
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
  `.agents/superpowers/plans/2026-09-07-ai-chat.md`; transport is
  `.agents/superpowers/plans/2026-09-11-composer-ai-sdk.md`. Shipped:
  `preview_command` (`lib/commands/preview.ts`), the `record_movement`
  Composer proposal (`lib/composer/state.ts`), and the offline outbox for
  fermentation readings (`lib/composer/outbox.ts`). Any other command needs
  its own registry-owned preview contract before it can be proposed.
- **Inventory correction needs durable identity.** The FG ledger links exact standalone adjustment/loss reversals through
  unique same-tenant `compensates_id`; the trigger preserves original bucket,
  classification and frozen BBL. `source_movement_id` remains shipped-return
  provenance. Inventory SKU detail exposes only eligible standalone corrections.
  Taproom counts now persist headers and explicit bin/SKU/lot UUID-or-null lines,
  including zero-variance counts. Their one-RPC command rejects stale revisions,
  incomplete buckets and overcounts; shortages post exact-bucket depletion with
  frozen BBL. The count UI also exposes the latest uncorrected mistaken-low root
  to Admin: one replacement count and linked signed movements preserve the root,
  reporting classification, observation time, and effective next-count baseline.
  Batch completion links any exact automatic generic-loss root from
  `batches.completion_adjustment_id`, excludes that nonphysical row from vessel
  volume, and validates the reciprocal same-tenant graph at commit. See the
  accepted Program 12 completion and correction spec.
- **Auth invitations use a durable external-write workflow.** One canonical
  command request claims a private invitation. Auth's first `invited_at` write
  binds its user id in that same transaction using an invitation token and
  matching email; mutable user metadata alone cannot create membership.
  Completion locks the invitation and atomically creates membership and marks
  complete. Tests force both lost Auth responses and real membership failures
  for staff and customers. Completed retries return the original user id without
  restoring revoked access. An unfinished request blocks its email only within
  its own brewery; a failed request never blocks a new one. A `pending_auth`
  row older than 15 minutes for that email is marked failed before the next
  claim inserts, so a crash between claim and completion doesn't block the
  email forever (#580). Existing Auth accounts receive a pending-consent invitation.
  The signed-in recipient accepts through the identity-bound pre-tenant command;
  acceptance rechecks expiry, confirmed email and current inviter authority.
  Completed replay never restores revoked membership; a new invitation does.
  Team, first-run, and customer detail
  share the command recovery lifecycle: frozen input and request identity survive
  reloads in the same browser tab, scoped to the original actor and tenant.
- **CSV exemption stops between logical rows.** `import_csv` may continue after
  one independent CSV row fails, but dependent writes inside a logical row still
  require one Postgres function. `begin_csv_import` binds the complete batch
  manifest to its request;
  `import_csv_row` commits each logical row and its durable committed or blocked
  outcome. Exact reruns return original results, including opening movement IDs.
  Corrected batches contain only blocked rows. Proven by `tests/commands-import.test.ts`;
  the wizard preserves unresolved batch identity and original preview row numbers
  across reloads in the same browser tab.

## Schema conventions

Append-only ledgers over mutable counters; triggers for derived values;
no status columns that won't be kept accurate. Full rationale:
`.agents/superpowers/specs/2026-08-31-mgr-schema-decisions.md`.

RLS predicates are index-backed: every table whose policy filters on
`brewery_id` has an index whose first column is `brewery_id` (a unique
constraint or query index leading with it counts). Policies call
`(select auth.uid())`, never bare `auth.uid()`, so the lookup runs once per
statement instead of once per row. *Enforced by:*
`tests/schema-rls-indexes.test.ts` (from the 2026-09-05 security audit, not committed; PR #149).

`movements_onhand_idx` and `allocations_open_idx` carry `include (qty)`, so
`portal_availability`'s per-brewery sums can be index-only scans. Heap fetches
remain for pages vacuum has not yet marked all-visible. The cost: on
`allocations`, a qty update on an open row is no longer a HOT update;
`inventory_movements` is append-only, so it pays only the wider entry.
*Enforced by:* `tests/schema-rls-indexes.test.ts`, which explains the
function's body and expects both index-only scans, and rejects two indexes on
one table with the same keys whatever their `include` (#794). So widen an
existing index with `include` rather than adding a second one on the same keys.

## Working files

Agent-facing files and where each harness reads them. `AGENTS.md` keeps a
short version of this list.

- `.agents/MEMORY.md` — durable facts and decisions. Written by the dreaming PR from merged PR descriptions; edit directly only in a dedicated docs PR.
- `.agents/PROGRESS.md` — dated Done log only. Same rule: state the change in the PR description, the dreaming PR writes it here.
- `.agents/DRIFT.md` — unresolved contradictions in artifacts the dreaming agent cannot edit.
- `.agents/codemaps/` — five short maps (architecture, backend, frontend, data, dependencies) of where things live. Each header names the commit it describes. Nothing regenerates them automatically: rerun Claude Code's `/ecc:update-codemaps` after structural changes. This file stays the owner of every rule; a map that disagrees with it is stale.
- `.agents/superpowers/{specs,plans}` — design specs and plans; `docs/superpowers` is a symlink to it (the superpowers skills write there).
- `.agents/agents/` — subagent definitions; `.claude/agents` is a symlink to it (Claude Code only reads `.claude/agents`).
- `.claude/settings.json` — shared Claude Code allowlist: the proof checks and plain `git fetch`, in exact forms. Never add interpreters, shells, `bun run *`, pushes, other writes, or a trailing `*` on a command whose flags can run code (`git fetch --upload-pack`, `vitest --config`).
- `.agents/skills/` — project-local reusable workflows; `.claude/skills` is a symlink to it (Claude Code only reads `.claude/skills`); `.pi/prompts/` may provide thin Pi command aliases without duplicating skill instructions.
- `.agents/worktrees/<branch>/` — the only place for worktrees: `scripts/worktree.sh <branch> [base]` creates one, symlinks the gitignored `.env.local`/`.env.test.local` from the main checkout, and runs `bun install` (Turbopack rejects a node_modules symlink, so each worktree owns its own). Plain `git worktree add` leaves a checkout that cannot run `vitest` or `next dev`. Gitignored.
- `scripts/land-pr.sh <pr> [--merge]` — lands one PR from its worktree: merges origin/main (resolving only a `migrations.lock.json` conflict), regenerates the lock and API docs, runs the local proof (tsc, lint, the PR's tests plus every test naming a SQL function its migrations define, against the test database `scripts/test-db.sh` builds, under its exclusive lock), pushes, waits for CI and reruns Docker/port infra failures, then merges. Before syncing it requires `claude-code-review.yml`: one run in which the `simplify` job (Claude Code's `/simplify`, applied and pushed to the branch) and the `claude-review` job both succeeded. A draft is marked ready first, since that workflow skips drafts. Bot PRs and PRs editing that workflow are exempt, as the workflow skips them. Chain calls in migration-timestamp order for a queue; one session merges at a time. Exit codes are listed in its header.
- `scripts/land-pr.sh <pr> --sync-only` — syncs and regenerates without requiring an earlier review, running proof, pushing, or merging the PR. Use it to repair conflicts that prevent GitHub from scheduling review. Resolve non-lock conflicts and commit, then rerun it; prove and push the repaired branch before requesting review. Normal landing still enforces the review and CI gates above.
- `.agents/agents/dreaming.md` — prompt for the dreaming workflow
  (`.github/workflows/dreaming.yml`) that curates the agent docs via a
  `dreaming/main` PR authored by the MGR GitHub App (`mgr[bot]`);
  merged PRs are its input; committed `.remember/today-*.md` digests, when
  present, are extra evidence.
