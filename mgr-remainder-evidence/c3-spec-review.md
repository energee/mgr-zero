# C3 specification review

- Target: `231afee6282c9a4e14447f05084f088c3990fc89..55006ca3dbb1841a19d6deb19a6336e6d6743f1e`
- Checkout: `/Users/tedslesinski/Repos/mgr-zero/.agents/worktrees/composer`
- Review mode: read-only; no database, browser session, source edit, push, or PR action
- Disposition: **CHANGES REQUIRED**

## Findings

### [P1] Do not expose account-priced portal history through brewery-only conversations — `app/(portal)/layout.tsx:25`

C3 mounts `Composer` for customers, writes the selected account's availability and exact account price into history (`components/mgr/composer.tsx:195-210`), and later reloads all conversations through `list_chat_conversations` / `get_chat_history` (`components/mgr/composer.tsx:219-230`). Those non-`portal_*` history commands are registered for `roles: "any"` (`lib/commands/preview.ts:13-43`), while the SQL conversation identity is only `(actor_id, brewery_id)` (`supabase/migrations/00001_baseline.sql:3670-3737`); it never binds or filters `customer_id` or current role. A buyer whose selected customer membership changes within the same brewery can therefore reopen history containing the prior account's price, despite the React key clearing the in-memory view. The same mechanism re-exposes old privileged staff history after a same-brewery role change. This violates C3's no-cross-account history proof and the portal boundary that customer tools remain `portal_*`. Keep C3 staff-only for now, or add a portal-specific, current-customer-scoped history contract before mounting it in `PortalLayout`.

### [P2] Make the inventory composer states match the reachable live structured picker — `components/mgr/screens.tsx:854`

The explorer still publishes a free-form “Blew a half…” question with two choice chips and a resolved proposal without the structured picker (`components/mgr/screens.tsx:854-905`). The live no-model path cannot produce that state: it renders the full SKU/type/direction/location/bin/lot/quantity form and passes only a missing-field prompt with no query or choices (`components/mgr/composer.tsx:250-265`). The supplied desktop screenshot confirms the picker remains visible above the proposal. Shell parity also differs by role: inventory frames always call `E.comp()` (`components/mgr/screen-frame.tsx:70-75`), whose default shows movement and ATP actions (`components/mgr/views/composer.tsx:12-16`), while live Sales shows ATP only and Brewer/Taproom show no actions (`lib/composer/state.ts:138-146`). The added test checks component identities/import text, so it does not catch either prop/composition mismatch. Update the inventory records and shell fixture adapter to render the same structured state and role-filtered actions as live, or keep the unavailable free-form states gated.

## Requirements verified

The staff path uses the existing command endpoint and current expected actor/brewery/customer context; registry and SQL re-check current role. Complete movement input calls the C2 server preview, renders server-returned effects/warnings, clears eligibility on edit/dismiss, preserves the normal form route, uses a stable request ID for replay, and handles stale `409` by requiring a new preview. ATP and portal availability are live registered reads with a post-read timestamp. Voice/model/provider capability is explicitly absent. Offline outbox remains gated for C4. Customer action metadata itself contains only `portal_catalog`, and registry AI-tool enumeration filters customer tools to `portal_*`; the P1 issue is the separately exposed history plumbing and its missing customer scope.

The supplied evidence records 6 focused C3 tests, 67 inherited C1/C2/portal/context tests, 184 static/pure tests, TypeScript, lint, docs generation, and desktop/mobile browser checks. I inspected the desktop proposal evidence; it corroborates the live composition mismatch above. The exact checkout remained clean at `55006ca3dbb1841a19d6deb19a6336e6d6743f1e`.
