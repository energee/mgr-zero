# More than one staff role per member (#797)

Status: **plan only — do not build.** On 2026-10-10 the owner decided to keep the
multi-role design but not build it yet. Build starts only after the owner lifts
that hold on #797. This plan exists so the build can start on approval.

## Why

Schema-design §2 (decided 2026-09-07) makes `brewery_users.roles` an array.
One person sells and brews. Today they must be made admin or pick one role.
The shipped schema still has one scalar `brewery_users.role`.

## What the code has today (counted 2026-10-14)

Counted on the local `mgr_test` stack at `20261014120000_price_group_barcodes`.
Migration text over-counts, because later migrations replace earlier bodies.
The live catalog is the count; the queries are under "Re-count before building".

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

## Found while counting: a live authorization hole

This is not part of #797. It exists today, in single-role code.
`public.staff_role(b)` is null for a non-member.
`if public.staff_role(b) <> 'admin' then raise` compares to null, so it does not raise.
On 2026-10-14 a non-member called `begin_qbo_oauth` for another brewery on the
test stack and got an intent id back (rolled back).
The same guard shape is in `set_qbo_deposit_mapping`, `set_qbo_push_defaults`,
`set_qbo_item_mapping`, `set_qbo_customer_mapping` and `start_qbo_push`.
`unlink_chat_user` and `assert_route_runner` use it too, but `assert_staff` runs first there.
Task 3 replaces these guards with `assert_staff`, which refuses a non-member.
Because #797 is on hold, this should be fixed in its own PR now.

## Decisions needed

Each row has a recommendation. The owner confirms or changes it before Task 1.

| # | Question | Recommendation |
|---|---|---|
| D1 | Keep a primary role for display? | No. Show the roles joined in enum order (`admin, sales, warehouse, brewer, taproom`). Nothing in the database needs one role. |
| D2 | What counts as the last admin? | The last member whose `roles` contain `admin` (as §2 says). Removing `admin` from an admin+sales member is a demotion and is refused if they are the last admin. |
| D3 | Can one invite grant several roles? | No. An invite grants one role. The admin adds more on Team member. `private.invite_requests.role` stays scalar. |
| D4 | How does `update_staff_role` change? | Same command name. Input `role` becomes `roles` (one or more). This breaks the HTTP input; MGR is pre-release. |
| D5 | Is admin combined with other roles allowed? | Yes, stored as given, no normalization. Admin already implies every other role. |
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
| `app/(app)/locations/page.tsx:25` | brewer gets no inventory link | hidden only for brewer-only |
| `lib/mgr/water-profiles-view.ts:28` | brewer goes back to Recipes | Recipes only for brewer-only |

`is_staff_of` excludes taproom by listing the other four roles. That stays a
positive overlap, so taproom+brewer gets full staff reads (D6).

## Migrations

Six files in one PR. They sort after `20261014120000_price_group_barcodes.sql`,
the newest on 2026-10-14. Re-date all six to the build day before committing.
Run `bun run migrations:lock` once, after every file is written.

| File | Content |
|---|---|
| `20261015000000_staff_roles.sql` | column, backfill, helpers, 13 policies, team RPCs |
| `20261015000100_staff_roles_chat.sql` | 17 chat and notification functions |
| `20261015000200_staff_roles_qbo.sql` | 17 QuickBooks and integration-token functions |
| `20261015000300_staff_roles_square.sql` | 15 Square and POS functions |
| `20261015000400_staff_roles_orders_stock.sql` | 8 order, route and stock functions |
| `20261015000500_drop_scalar_staff_role.sql` | drop `brewery_users.role` and `staff_role(uuid)` |

The column is dropped last because `language sql` bodies are checked when they
are created.

### `20261015000000_staff_roles.sql`

```sql
-- More than one staff role per member (#797): roles becomes an array.
alter table public.brewery_users add column roles public.staff_role[];
update public.brewery_users set roles = array[role];
alter table public.brewery_users
  alter column roles set not null,
  alter column role drop not null,  -- dropped in ..._drop_scalar_staff_role
  add constraint brewery_users_roles_nonempty check (cardinality(roles) > 0);

-- The caller's roles at a brewery; null for a non-member.
create function public.staff_roles(b uuid) returns public.staff_role[]
  language sql stable security definer set search_path = '' as $$
  select roles from public.brewery_users
  where user_id = auth.uid() and brewery_id = b and private.request_scope_allows(b) $$;

-- Whether the caller holds any of p_roles; false, never null, for a non-member.
create function public.has_staff_role(b uuid, p_roles public.staff_role[]) returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(public.staff_roles(b) && p_roles, false) $$;

revoke execute on function public.staff_roles(uuid) from public, anon;
revoke execute on function public.has_staff_role(uuid, public.staff_role[]) from public, anon;
grant execute on function public.staff_roles(uuid) to authenticated, service_role;
grant execute on function public.has_staff_role(uuid, public.staff_role[]) to authenticated, service_role;

create or replace function public.is_staff_of(b uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select private.request_scope_allows(b) and exists(select 1 from public.brewery_users
    where user_id = auth.uid() and brewery_id = b
      and roles && array['admin','sales','warehouse','brewer']::public.staff_role[]) $$;

create or replace function public.my_staff_brewery_ids(p_roles public.staff_role[]) returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select brewery_id from public.brewery_users
  where user_id = auth.uid() and roles && p_roles and private.request_scope_allows(brewery_id) $$;

-- Table list copied verbatim from the current body.
create or replace function public.taproom_can(b uuid, t text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select public.has_staff_role(b, array['taproom']::public.staff_role[]) and t = any(array[
    'locations','bins','taproom_pars','taproom_counts','taproom_count_lines','tap_intervals',
    'brands','formats','format_components','skus','keg_pools',
    'pos_locations','pos_item_mappings']) $$;
```

`private.assert_staff`, `private.assert_order_staff` and
`private.assert_invoice_staff` each change one predicate:
`role = any(p_roles)` becomes `roles && p_roles`. The rest of each body is copied
from `pg_get_functiondef`.

`private.assert_not_last_admin` changes `role = 'admin'` to
`'admin' = any(roles)` in all four places.

The 13 direct policies are dropped and re-created. Every other clause stays as
`pg_policies` shows it.

| Policies | New predicate |
|---|---|
| `chat_installations_admin_read`, `notification_destinations_admin_shared_read` | `(select public.has_staff_role(brewery_id, array['admin']::public.staff_role[]))` |
| `chat_user_links_self_read`, `notification_destinations_personal_read`, `notification_preferences_self_read` | `(select public.staff_roles(brewery_id)) is not null` |
| `staff_read` on `pos_catalog_items`, `pos_catalog_ownership`, `pos_catalog_variations`, `pos_menu_lines`, `pos_menus` | `public.has_staff_role(brewery_id, array['admin','warehouse']::public.staff_role[])` |
| `integration_operator_read` on `pos_connections`, `qbo_connections`, `qbo_pushes` | `public.has_staff_role(brewery_id, array['admin','sales']::public.staff_role[])` |

Team and invite functions, in the same file:

```sql
drop function public.update_staff_role(uuid, uuid, public.staff_role, uuid);
create function public.update_staff_role(p_brewery uuid, p_user uuid, p_roles public.staff_role[], p_request_id uuid)
  returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_replay jsonb; v_row public.brewery_users;
  v_roles public.staff_role[] := array(select distinct r from unnest(p_roles) r order by r);
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  if cardinality(v_roles) = 0 then raise exception 'choose at least one role'; end if;
  v_replay := private.claim_command_request(p_brewery, 'update_staff_role', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'user', p_user, 'roles', to_jsonb(v_roles)));
  if v_replay is not null then return v_replay; end if;
  if not 'admin' = any(v_roles) then perform private.assert_not_last_admin(p_brewery, p_user); end if;
  update public.brewery_users set roles = v_roles
    where brewery_id = p_brewery and user_id = p_user returning * into v_row;
  if v_row.user_id is null then raise exception 'member not found'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke execute on function public.update_staff_role(uuid, uuid, public.staff_role[], uuid) from public, anon;
grant execute on function public.update_staff_role(uuid, uuid, public.staff_role[], uuid) to authenticated, service_role;
```

| Function | Change |
|---|---|
| `private.grant_invite_membership` | inserts `roles = array[p_row.role]` (D3) |
| `public.provision_brewery` | inserts `roles = array['admin']` |
| `public.accept_account_invitation` | `role = any(private.invite_roles(...))` becomes `roles && private.invite_roles(...)` |
| `public.list_team_members` | returns `roles staff_role[]` in place of `role`; drop and re-create, then re-grant; orders by email |
| `public.list_customer_users` | `me.role = any(...)` becomes `me.roles && ...` |

### Rewrite rules for the four function files

Each function keeps its signature unless its result carries the role.
A changed result type needs `drop function`, `create`, and the same grants again.

| Old | New |
|---|---|
| `bu.role = 'admin'` | `'admin' = any(bu.roles)` |
| `role in ('a','b')`, `role = any(array[...])` | `roles && array['a','b']::public.staff_role[]` |
| `if public.staff_role(b) <> 'admin' then raise ...` | `perform private.assert_staff(b, array['admin']::public.staff_role[])` |
| `if public.staff_role(b) not in ('a','b') then raise ...` | `perform private.assert_staff(b, array['a','b']::public.staff_role[])` |
| `public.staff_role(b) <> 'admin'` inside a larger condition | `not public.has_staff_role(b, array['admin']::public.staff_role[])` |
| `public.staff_role(b) in ('a','b')` in a `where` | `public.has_staff_role(b, array['a','b']::public.staff_role[])` |
| `public.staff_role(b) is null` | `public.staff_roles(b) is null` |
| `payload->'recipient_roles' ? bu.role::text` | `payload->'recipient_roles' ?\| bu.roles::text[]` |
| `bu.role::text = any(c.recipient_roles)` | `bu.roles::text[] && c.recipient_roles` |
| `select bu.role into r`, `'role', bu.role` | return `roles` |
| taproom quiet-hours refusal in `set_notification_preference` | `has_staff_role(b, '{taproom}') and not has_staff_role(b, '{admin,sales,warehouse,brewer}')` |

`assert_staff` raises SQLSTATE `42501`. Some old checks raised a plain
exception. Each task checks that its command still maps the error to a 403.

Function groups:

- **Chat (17):** `consume_chat_link_proof`, `set_chat_quiet_hours`, `snooze_chat_delivery`, `activate_chat_installation`, `assert_chat_admin`, `chat_fanout_deliveries`, `chat_settings_request_completed`, `find_chat_oauth_intent`, `get_chat_delivery_context`, `get_chat_home_items`, `get_chat_settings_installation`, `get_today_items`, `list_chat_user_links`, `resolve_chat_actor`, `set_notification_destination`, `set_notification_preference`, `unlink_chat_user`.
- **QuickBooks (17):** `begin_qbo_disconnect`, `begin_qbo_oauth`, `claim_qbo_oauth`, `complete_qbo_invoice_sync`, `complete_qbo_oauth`, `finish_qbo_disconnect`, `finish_qbo_push`, `mark_qbo_authorization_failed`, `record_qbo_invoice_sync_failure`, `set_qbo_customer_mapping`, `set_qbo_deposit_mapping`, `set_qbo_item_mapping`, `set_qbo_push_defaults`, `start_qbo_push`, `read_integration_tokens`, `store_integration_tokens`, `cas_integration_tokens`.
- **Square (15):** `supersede_square_publications`, `advance_square_catalog_sync`, `advance_square_sales_sync`, `begin_square_disconnect`, `claim_square_oauth`, `complete_square_oauth`, `finish_square_menu_publication`, `finish_square_publication`, `lease_square_publication`, `mark_square_authorization_failed`, `prepare_square_publication`, `record_square_catalog_snapshot`, `record_square_sales_locations`, `record_square_sales_page`, `pos_order_versions`.
- **Orders and stock (8):** `assert_route_runner`, `save_route_impl`, `create_replenishment_order`, `set_standing_allocation`, `submit_order`, `update_draft_order`, `on_hand_rows`, `keg_bin_on_hand_rows`.

### `20261015000500_drop_scalar_staff_role.sql`

```sql
alter table public.brewery_users drop column role;
drop function public.staff_role(uuid);  -- fails if a policy or sql function still uses it
```

## Tasks

TDD per AGENTS.md: each task writes its named test first and watches it fail.
Every task ends with `bunx tsc --noEmit` clean and its named tests green on the
`mgr_test` stack (`scripts/test-db.sh`).

1. **Core migration.** Files: `20261015000000_staff_roles.sql`, `tests/rpc-allowlist.test.ts`, `supabase/migrations.lock.json`. Types: `public.staff_role[]`. Test first: new `tests/rls-multi-role.test.ts`. It reuses the per-table classification in `tests/rls-taproom.test.ts`. For each of the 92 policies, a sales+brewer, warehouse+brewer and taproom+brewer member reads exactly the union of what each single role reads. Extend `tests/team-last-admin-race.test.ts`: an admin+sales last admin cannot drop `admin`. Acceptance: both files green. Depends on: nothing.
2. **Chat functions.** File: `20261015000100_staff_roles_chat.sql`. Test first: extend `tests/chat-delivery-policy.test.ts` and `tests/chat-linking.test.ts`. A sales+warehouse member receives both roles' deliveries. A taproom+brewer member may set quiet hours. A taproom-only member still may not. Depends on: 1.
3. **QuickBooks functions.** File: `20261015000200_staff_roles_qbo.sql`. Test first: extend `tests/qbo-lifecycle-sql.test.ts`. A warehouse+sales member may start a push. A warehouse-only member and a non-member are refused with `42501`. Depends on: 1.
4. **Square functions.** File: `20261015000300_staff_roles_square.sql`. Test first: extend `tests/pos-lifecycle-sql.test.ts`. A sales+warehouse member may publish a menu. A publication by a member who loses warehouse is superseded with `role_changed`. Depends on: 1.
5. **Order and stock functions.** File: `20261015000400_staff_roles_orders_stock.sql`. Test first: extend `tests/rls-orders.test.ts` (warehouse+sales may submit and edit a draft) and `tests/rls-taproom.test.ts` (taproom+brewer sees every location's on-hand). Depends on: 1.
6. **Drop the scalar.** File: `20261015000500_drop_scalar_staff_role.sql`. Test first: new `tests/staff-roles-schema.test.ts`. It reads the catalog and asserts four things. `brewery_users` has `roles` and no `role`. No policy text calls `staff_role(`. No function body in `public` or `private` reads `brewery_users.role`. `staff_role(uuid)` does not exist. Depends on: 2, 3, 4, 5.
7. **Types and fixtures.** Files: `lib/supabase/database.generated.ts` (`bun run types:database`), `tests/helpers.ts` (`makeStaff(breweryId, role: StaffRole | StaffRole[])`), the direct `brewery_users` writes in `tests/` (44 lines in 22 files on 2026-10-14), `scripts/seed-dev.ts`. Test: `bunx tsc --noEmit` is red before and green after; no behavior is new. Depends on: 6.
8. **Command context.** Files: `lib/commands/registry.ts` (`Ctx.roles: (StaffRole | "customer")[]`, the gate at `canRun` and `runCommand`), `lib/commands/context.ts`, `lib/auth/request-context.ts` (`staffRoleAt` becomes `staffRolesAt`; `StaffMembership.roles`), `lib/brewery.ts`. New `lib/mgr/roles.ts` holds `hasAnyRole(held, allowed)` and `onlyRoles(held, set)`. It replaces `hasRole` in `lib/mgr/order-status.ts`, which then imports it; there is one copy. Test first: extend `tests/registry.test.ts`. A sales+brewer context may run a sales-only and a brewer-only command. A warehouse+brewer context may not run an admin command. Also extend `tests/request-context-binding.test.ts`. Depends on: 7.
9. **Command handlers.** Files: `lib/qbo.ts`, `lib/pos.ts`, `lib/chat/oauth.ts`, `lib/chat/linking.ts`, `lib/supabase/integration-tokens.ts`, `lib/commands/{chat,orders,customers,today,landings,delivery,invites}.ts`. Each `ctx.role === x` becomes `hasAnyRole(ctx.roles, [x])`. `delivery.ts` uses `.overlaps("roles", [...])`. Test first: extend `tests/integration-command-roles.test.ts` and `tests/commands-today.test.ts` with two-role contexts. Depends on: 8.
10. **Navigation.** Files: `lib/mgr/nav.ts` (`navFor`, `canOpen` take `roles`), `lib/mgr/search-palette-state.ts`, `components/mgr/work-tabs.tsx`, `DEFAULT_WORK_KINDS` in `lib/commands/landings.ts` (union of each role's chips). Test first: extend `tests/mgr-nav.test.ts` and `tests/nav-page-roles.test.ts`. Brewer+sales sees Batches and Customers. Depends on: 8.
11. **Pages and views.** Files: every `brewery.role` in `app/(app)/**` and `app/api/integrations/{qbo,square}/oauth/route.ts`, `lib/mgr/{qbo-ui,invoices-view,water-profiles-view}.ts`, `components/mgr/views/weekly-count.tsx`, `components/mgr/composer.tsx`, `components/mgr/search-palette.tsx`, `lib/commands/query-cache.ts` (scope key joins the roles). Applies the D6 table above. Test first: new `tests/multi-role-exclusions.test.ts`. It tests `onlyRoles` and each exclusion row in the table with a single role and with that role plus one other. Depends on: 8.
12. **Team screen.** Files: `components/mgr/e.tsx` (give `E.picks` controlled `onChange` and `disabled`; no local replacement), `components/mgr/views/team-controls.tsx` (`TeamMemberView` picks several roles), `app/(app)/settings/team/member-form.tsx`, `lib/commands/invites.ts` (`update_staff_role` input `roles: z.array(z.enum(STAFF_ROLES)).min(1)`; `TeamMember.roles`), the Team and Team member frames in `components/mgr/screens.tsx`. Invite stays single-role (D3). Test first: extend `tests/team-controls-view.test.ts` and `tests/team.test.ts`. Run the screen-only proof list in AGENTS.md and look at `/settings/team`. Depends on: 9.
13. **Docs.** Files: `content/docs/api/team.mdx` (via `bun run docs:api`), `content/docs/staff-guide.mdx` `#roles` (a member can hold several roles and gets everything each one allows), schema-design §2 (drop "not built"), `.agents/ARCHITECTURE.md` iron rule naming `staff_role()`. Test: `tests/docs.test.ts`, `tests/api-docs.test.ts`, `tests/design-docs.test.ts`. Depends on: 12.

### Parallelism

- 1 runs alone.
- 2, 3, 4 and 5 run in parallel. Each owns one migration file. `migrations.lock.json` is regenerated once after all four land.
- 6 and 7 run in order.
- 9, 10 and 11 run in parallel after 8. They touch different files.
- 12 follows 9. 13 runs last.

Final proof: `bun run test && bunx tsc --noEmit && bun run lint`, then `/simplify`.

## Re-count before building

The tables above are a snapshot. Re-run these on the test stack at the build
commit. A difference means a migration landed since 2026-10-14.

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
