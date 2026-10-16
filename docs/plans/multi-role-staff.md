# More than one staff role per member (#797)

Status: **owner approved and implemented; final verification pending.** On
2026-10-16 the owner lifted the 2026-10-10 hold with “BUILD IT” on #797.
The implementation is a clean scalar-to-array cutover, not a compatibility layer.

## Why

Schema-design §2 (decided 2026-09-07) makes `brewery_users.roles` an array.
One person sells and brews. A scalar role forced them to be admin or pick one role.
Members now hold one or more roles and receive the union of their permissions.
Portal customer membership remains strictly separate.

## Before-cutover snapshot (counted 2026-10-14)

The following counts describe the scalar schema before #797, not the current
implementation. They were counted on local `mgr_test` at
`20261014120000_price_group_barcodes`. Migration text over-counts because later
migrations replace earlier bodies. The catalog queries are preserved below.

| Surface | Count | Notes |
|---|---|---|
| RLS policies that depend on the role | 92 of 96 | 79 go through a helper; 13 call `staff_role()` directly |
| Helper functions | 8 | `staff_role`, `is_staff_of`, `my_staff_brewery_ids`, `taproom_can`, `assert_staff`, `assert_order_staff`, `assert_invoice_staff`, `assert_not_last_admin` |
| Other functions reading the role | 63 | 12 call `staff_role()`; 51 read `brewery_users.role` directly |
| TypeScript role comparisons | 84 lines in 52 files | `grep` for `ctx.role`, `.role ===`, `.role !==` |
| Columns typed `staff_role` | 2 | `brewery_users.role`, `private.invite_requests.role` |

The issue's "~36 calls and ~55 predicates across 12 migrations" is replaced by
this table.

The 79 helper-routed policies need no edit. Only the helper bodies change.

## Authorization guard corrected in the cutover

The before-cutover scalar code also exposed an authorization hole:
`public.staff_role(b)` was null for a non-member.
`if public.staff_role(b) <> 'admin' then raise` compares to null, so it does not raise.
On 2026-10-14 a non-member called `begin_qbo_oauth` for another brewery on the
test stack and got an intent id back (rolled back).
The same guard shape is in `set_qbo_deposit_mapping`, `set_qbo_push_defaults`,
`set_qbo_item_mapping`, `set_qbo_customer_mapping` and `start_qbo_push`.
`unlink_chat_user` and `assert_route_runner` use it too, but `assert_staff` runs first there.
The cutover replaces these guards with `assert_staff`, which refuses a
non-member. It does not preserve the unsafe null comparison.

## Owner-approved decisions

These decisions define the implementation approved on 2026-10-16.

| # | Question | Recommendation |
|---|---|---|
| D1 | Keep a primary role for display? | No. Show the roles joined in enum order (`admin, sales, warehouse, brewer, taproom`). Nothing in the database needs one role. |
| D2 | What counts as the last admin? | The last member whose `roles` contain `admin` (as §2 says). Removing `admin` from an admin+sales member is a demotion and is refused if they are the last admin. |
| D3 | Can one invite grant several roles? | No. An invite grants one role. The admin adds more on Team member. `private.invite_requests.role` stays scalar. |
| D4 | How does `update_staff_role` change? | Same command name. Input `role` becomes `roles` (one or more). This breaks the HTTP input; MGR is pre-release. |
| D5 | Is admin combined with other roles allowed? | Yes. Keep every granted role, including roles redundant with Admin. Arrays are deduplicated and sorted in enum order; Admin already implies every staff permission. |
| D6 | How does a restriction aimed at one role behave? | It applies only when every held role is restricted. Taproom+brewer gets Search, quiet hours and lot labels, because brewer has them. This is union semantics. |
| D7 | Keep the scalar column or `staff_role(uuid)` for compatibility? | No. Drop both in the same PR. A catalog test proves nothing still reads them. |
| D8 | Deploy | The hosted push and the Vercel deploy go out together. Both are ask-first under AGENTS.md. |

## Checks that union semantics change ("role X and not role Y")

A positive check (`role in (...)`) becomes an overlap and keeps its meaning.
These checks exclude a role, so a second role changes their answer.
Each one becomes "only when every held role is excluded" (D6).

| Where | Today | After |
|---|---|---|
| `set_notification_preference` (SQL) | taproom may not set quiet hours | refused only for taproom-only |
| `lib/commands/chat.ts:19` | same rule in the command | same |
| `app/(app)/settings/chat/preferences/page.tsx:12` | `canSetQuietHours = role !== "taproom"` | false only for taproom-only |
| `app/(app)/layout.tsx:35` | no Search for taproom | no Search only for taproom-only |
| `app/(app)/page.tsx:30` | taproom gets the taproom Today | taproom-only gets it |
| `lib/commands/landings.ts:55` | taproom gets the taproom Beer landing | taproom-only gets it |
| `app/(app)/taproom/page.tsx:53`, `components/mgr/views/weekly-count.tsx:97` | taproom sees no lot labels | taproom-only sees none |
| `app/(app)/invoices/[id]/page.tsx:33` | warehouse gets no invoice questions | use `canRun(ctx, "list_invoice_questions")` |
| `lib/mgr/qbo-ui.ts:52` | warehouse, brewer, taproom get no QuickBooks state | hidden only without admin or sales |
| `app/(app)/locations/page.tsx:25` | brewer gets no inventory link | use `canRun(ctx, "get_atp")`; Brewer + Taproom still lacks inventory permission |
| `lib/mgr/water-profiles-view.ts:28` | brewer goes back to Recipes | return to Catalog only with Admin, Sales or Warehouse; Brewer + Taproom returns to Recipes |

`is_staff_of` excludes taproom by listing the other four roles. That stays a
positive overlap, so taproom+brewer gets full staff reads (D6).

The implementation audit uses destination permissions for the last two rows,
not the original "brewer-only" shortcut. Taproom does not grant either destination.
The general Beer landing also retains the Taproom and Tap board destinations
when a Taproom member gains Sales or Brewer.

## Implemented migrations

The core cutover is `supabase/migrations/20261017144000_staff_roles.sql`.
The original six-file sequence was consolidated so the schema, callers and
scalar drop form one cutover. Committed migrations remain unchanged.

`20261017144100_staff_actor_roles.sql` adds the canonical private
`actor_has_staff_roles(brewery, actor, allowed)` predicate and migrates repeated
trusted service-actor checks. It is `SECURITY INVOKER`, stable, has an empty search
path, and is not directly executable by public, anon, authenticated or service
roles. Trusted outer definer owners invoke it. This also replaces the scalar
implementation introduced by #870's earlier migration without rewriting that
committed migration. Both independently main-based branches use the same signature.

`20261017144200_staff_roles_security_guards.sql` preserves the independently
authored #929 and #640 security corrections after restating role-sensitive
functions. Slack OAuth lookup and activation bind to the stored initiating user,
who must still hold Admin. A tokenless old Square disconnect does not expose a
merchant-wide revoke target while another brewery owns that connected seller.
Standalone role-array regressions cover both guards. The role migrations never
replace #928's finite-quantity `private.assert_order_lines` helper.

The migration lock and public generated database types reflect this cutover.

| Surface | Implementation |
|---|---|
| Membership | Backfill `roles` from the scalar role, require a nonempty one-dimensional null-free array, and store unique values in enum order. |
| Helpers | `staff_roles(b)` returns `staff_role[]` or null for a non-member. `has_staff_role(b, allowed)` returns overlap or false for a non-member. |
| Authorization | Staff, order and invoice guards use overlap against explicit allowed lists. Admin is included by each allowed list where permitted, not inserted implicitly by the helper. |
| RLS | Direct scalar policies use the existing role-array membership helpers; unrelated clauses remain intact. |
| Last admin | Count members whose roles contain Admin. Removing Admin is a demotion even if other roles remain, and cannot remove the last admin. |
| Team command | `update_staff_role` accepts `p_roles staff_role[]`; the command input is `roles`, not `role`. Empty selections are refused. Request identity uses canonical role values. |
| Team reads | `list_team_members` returns `roles staff_role[]`. Role labels use enum order: Admin, Sales, Warehouse, Brewer, Taproom. |
| Invitations | `private.invite_requests.role` remains scalar. Acceptance grants `array[role]`; Team member can add more afterward. |
| Bootstrap | `provision_brewery` grants the first member `array['admin']`. |
| Function groups | Chat delivery and notification preferences, QuickBooks and credential guards, Square authorization/publication, orders, routes and stock all use role arrays. |
| Restrictions | A restriction applies only when every held role is restricted. Taproom + Brewer retains Brewer's Search, quiet hours and lot labels. |
| Scalar removal | Drop `brewery_users.role` and `staff_role(uuid)` only after migrating every dependent policy and function. No compatibility aliases remain. |

The shared TypeScript helper `lib/mgr/roles.ts` follows the same explicit-list
semantics. `hasAnyRole(held, allowed)` is simple overlap. `onlyRoles(held, excluded)`
is true only for a nonempty held set entirely contained in the excluded roles.
`Ctx.roles`, `StaffMembership.roles`, `getActiveBrewery().roles`,
`staffRolesAt` and `getStaffRoles` carry arrays; portal contexts remain customer-only.
Persisted offline readings upgrade their old scalar-role scope to an array on
load without changing their request id, observation or uncertain recovery state.
The stored row is replaced before replay, and a failed storage upgrade surfaces
while retaining the original data. New contexts accept arrays only.

## Shared Team presentation

The inventory and live roster render `TeamView`. Their member forms render
`TeamMemberView` inside the existing `CommandForm` surface; the inventory's
`surface: "sheet"` record is mounted by the shared screen frame.
`TeamMemberView` owns the multi-select through controlled `E.picks`, including
disabled state, selection ordering, nonempty validation, unchanged-set detection
and existing command-error presentation. The live `MemberForm` supplies
database-backed member data and sends `update_staff_role` with `roles`.
The inventory keeps each demo identity's saved roles consistent with its
persona and lets the shared picker choose combinations such as Sales + Brewer,
without live mutations.
`InviteView` keeps its single-role `E.pick` selector.

## Tasks

The implementation covers these thirteen areas. The tests listed here are the
required proof, not a claim that they have been run. Final verification belongs
to the integrating parent after all parallel changes land.

1. **Core migration.** Consolidated migration, RPC grants and migration lock; multi-role RLS union and last-admin race coverage.
2. **Chat functions.** Role-union fan-out; Taproom + Brewer may set quiet hours while Taproom-only may not.
3. **QuickBooks functions.** Warehouse + Sales may start a push; Warehouse-only and non-members are refused.
4. **Square functions.** Multi-role publication authorization and superseding a publication after required access is lost.
5. **Order and stock functions.** Warehouse + Sales order access and Taproom + Brewer stock reads.
6. **Drop the scalar.** Catalog proof that no scalar membership column, helper, policy or function dependency survives.
7. **Types and fixtures.** Generated database types, staff test helpers, direct membership fixtures and dev seed use role arrays.
8. **Command context.** `Ctx.roles`, array membership lookup and the shared `hasAnyRole` / `onlyRoles` predicates; registry and request-context binding coverage.
9. **Command handlers.** Integration, chat, order, customer, Today, landing, delivery and invite handlers use role arrays; invites still grant one role.
10. **Navigation.** `navFor`, `canOpen`, search, Work tabs and default Work kinds union permitted roles.
11. **Pages and views.** Staff route gates, views, Composer, search and cache scopes accept roles; exclusion rules follow the table above.
12. **Team screen.** Controlled `E.picks`, shared multi-role `TeamMemberView`, live member adapter, roster labels and inventory fixture. `tests/team-controls-view.test.ts` covers selection callbacks, enum order, nonempty validation, unchanged sets, pending writes and retained errors; `tests/team.test.ts` covers command behavior.
13. **Docs.** Staff guide explains union permissions, Admin and last-admin protection; schema and architecture name the array helpers. API docs are regenerated from the command registry.

Final proof: the repository's required tests, typecheck, lint and UI smoke
check, including `tests/team-controls-view.test.ts`, `tests/team.test.ts`,
`tests/docs.test.ts`, `tests/api-docs.test.ts`, `tests/design-docs.test.ts` and
the screen-only suite in AGENTS.md. No hosted calls or deployments are part
of this local implementation; those remain ask-first.

## Historical catalog-count queries

These queries supported the before-cutover snapshot above. The scalar query
is retained as historical evidence, not as a current authorization contract.

```sql
-- policies that depend on the role
select count(*) from pg_policies
where coalesce(qual,'')||coalesce(with_check,'') ~ '(staff_role\(|is_staff_of|my_staff_brewery_ids|taproom_can)';
-- functions that read the role outside the helpers
select n.nspname||'.'||p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private')
  and (p.prosrc ~ '([^_a-z]|^)staff_role\(' or (p.prosrc ~* '\mrole\M' and p.prosrc ~ 'brewery_users'))
order by 1;
```

The second query also lists functions that only mention `chat_messages.role`
or `invite_requests.role`. Drop those by reading each body.
