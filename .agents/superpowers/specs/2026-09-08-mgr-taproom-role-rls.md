# Taproom role: per-role RLS

Written 2026-09-08 for the TODO.md item "Per-role RLS spec for the `taproom`
role"; the matrix below was approved by Ted on 2026-09-07 (schema design
§16.16 item 3). It is the design Program 12 implements as its first task.
Nothing here changes the four existing roles.

## Why a fifth role needs its own policies

`staff_role` has `admin, sales, warehouse, brewer`. Every read policy is the
one template `staff_read … using (is_staff_of(brewery_id))`, and `is_staff_of`
is true for any `brewery_users` row. A bartender added as a fifth enum value
would therefore read customers, price lists, invoices, purchasing, production
and compliance, because membership alone is the whole test. Writes are already
narrow (no application-role DML; every mutation is one RPC that calls
`private.assert_staff(brewery, roles[])`), so the read side is the gap.
§16.13 says the role must not ship until this is closed; this document closes
it on paper.

## The matrix (approved 2026-09-07)

A bartender works a shift, not a function. They see the beer on the wall and
in the cooler, count it, and change kegs. Nothing else.

| Surface | Read | Write | Rows |
| --- | --- | --- | --- |
| Tap board and keg taps: `tap_intervals` (`keg_taps` in §16.13's wording) | yes | `tap_keg`, `swap_keg`, `kick_keg` | whole brewery |
| Weekly count: `taproom_counts`, `taproom_count_lines` | yes | `record_taproom_count` | whole brewery |
| Taproom bins and on-hand: `locations`, `bins`, `inventory_movements`, `taproom_pars`, and the `on_hand` / `bin_on_hand` / `keg_bin_on_hand` views | yes | none | rows whose location is `kind = 'taproom'` |
| Catalog vocabulary: `brands`, `formats`, `format_components`, `skus`, `keg_pools` | yes | none | whole brewery |
| Menu and POS mapping: `pos_locations`, `pos_item_mappings`, `pos_sales`, and `pos_menus` when Program 14 lands it | yes | none | whole brewery |
| Own account: `staff_brewery` (id, name, timezone, gravity unit), `brewery_users`, `chat_user_links`, `notification_preferences`, `notification_destinations` (personal) | yes | `set_my_gravity_unit`, `consume_chat_link_proof`, `unlink_chat_user`, `set_notification_preference`, `set_notification_destination` (personal) | own row only, as the existing self policies already say |
| Everything else | no | no | — |

"Everything else" is literal: customers, ship-tos, orders, order lines,
shipments, invoices, credit memos, price groups, channel prices, sale
channels, allocations, stock transfers, routes, deliveries, vendors,
materials, purchasing, counts of materials, recipes, batches, vessels,
occupancies, packaging runs, lots, fermentation, compliance, integration
connections, and every RPC that writes them. A taproom user calling a forbidden tenant RPC gets `42501`; direct SELECT
is empty under RLS, or receives `42501` where table SELECT itself is revoked.
Authenticated pre-tenant `provision_brewery` remains separately authorized.

Movements are read, never written directly: the weekly count posts its own
`depletion` rows through `record_taproom_count`, and tapping a keg posts
nothing (§16.15). `taproom_transfer` rows into the taproom are visible because
their destination location is a taproom; the warehouse leg of the same pair
is not.

## Mechanism

One baseline edit, four parts, in `supabase/migrations/00001_baseline.sql`.

1. **Enum.** `staff_role` gains `'taproom'`. `is_staff_of(b)` is narrowed to
   the four existing roles:

   ```sql
   create function is_staff_of(b uuid) returns boolean
   language sql stable security definer set search_path = '' as
   $$ select exists(select 1 from public.brewery_users
                    where user_id = auth.uid() and brewery_id = b and role <> 'taproom') $$;
   ```

   Every existing `staff_read`, `member_read`, `integration_operator_read`
   and `assert_staff` call therefore excludes the bartender with no other
   change. This is the "keep `is_staff_of` for the four existing roles" half
   of the decision.

2. **Predicate.** A second definer function names what the bartender may read:

   ```sql
   -- The taproom read surface, by table. Row scope for the location-bound
   -- tables is applied by the policy, not here.
   create function taproom_can(b uuid, t text) returns boolean
   language sql stable security definer set search_path = '' as
   $$ select exists(select 1 from public.brewery_users
                    where user_id = auth.uid() and brewery_id = b and role = 'taproom')
        and t = any (array[
          'tap_intervals','taproom_counts','taproom_count_lines',
          'locations','bins','inventory_movements','taproom_pars',
          'brands','formats','format_components','skus','keg_pools',
          'pos_locations','pos_item_mappings','pos_sales','pos_menus']) $$;
   ```

   The table list lives in one place. Adding a table to the bartender's
   world is one line here plus one row in the test below; there is no second
   allow-list to keep in step.

3. **Policies.** The `staff_read` generator loop passes the table name, so
   every generated policy becomes:

   ```sql
   create policy staff_read on %I for select
     using (public.is_staff_of(brewery_id) or public.taproom_can(brewery_id, %L))
   ```

   Four tables add a row scope on the taproom branch, written out by hand
   after the loop (the loop's policy is dropped for them first):

   ```sql
   create policy staff_read on inventory_movements for select using (
     public.is_staff_of(brewery_id)
     or (public.taproom_can(brewery_id, 'inventory_movements')
         and location_id in (select id from public.locations where kind = 'taproom')));
   ```

   The same shape on `bins` and `taproom_pars` (both by `location_id`);
   `locations` itself tests `kind = 'taproom'` directly. The `on_hand` and `bin_on_hand` invoker views inherit movement row scope.
   `keg_bin_on_hand` instead wraps a narrow auth-derived definer aggregate:
   original staff see their own tenant, taproom sees only taproom locations,
   with the same six columns and arithmetic. Raw keg events stay denied.
   Raw `breweries` stays denied too. `staff_brewery_rows()` and its invoker
   view expose only own membership id, name, timezone and gravity unit.
   Request membership resolution joins that projection without a private
   breweries inner embed. Own `brewery_users` membership remains readable.

   The self-row chat and notification policies retain their own-user predicates;
   their membership conjunct uses `staff_role(brewery_id) is not null`.

4. **RPCs.** `private.assert_staff` is unchanged. The write column of the
   matrix is the set of RPCs whose role array gains `'taproom'`: the four
   Program 12 commands (`tap_keg`, `swap_keg`, `kick_keg`,
   `record_taproom_count`) are created with it; `set_my_gravity_unit`,
   `consume_chat_link_proof`, `unlink_chat_user`, `set_notification_preference`
   and the personal branch of `set_notification_destination` add it. The personal destination branch selects a previously verified active own
   destination per reason using `notification_preferences.personal_destination_id`;
   it cannot provision an external identity or change an admin shared channel.
   Fanout honors that selection; NULL keeps existing routing. Personal quiet
   hours and snoozes remain original-four only, including callback helpers and
   the optional quiet-hours input on `set_notification_preference`.

On the application side, `StaffRole` in `lib/commands/registry.ts` gains
`"taproom"`, `tests/helpers.ts` `makeStaff` / `makeStaffCtx` accept it, the
same nine commands list it in `roles`, and `lib/mgr/nav.ts` gives the role
Today plus the Taproom, Taps and Menu entries when Program 12 ungates them.
The staff guide's roles table gains the row when the first taproom screen
ships (Program 12's docs task), not in this PR.

## The proof: one test walks every table

`tests/rls-taproom.test.ts`, database-backed, one `describe`:

- `beforeAll` makes a brewery, one member per role including `taproom`, and
  seeds one row in every table that has a `brewery_id` column, in a taproom
  location and a warehouse location where the table is location-bound. The
  seeding reuses the helpers the other RLS suites use; tables Program 12 adds
  are seeded in the same place.
- `it("reads exactly the matrix")` lists every table in `pg_tables` for the
  public schema with RLS enabled, selects each as the taproom user, and
  asserts `rows > 0` for the tables in the matrix and `rows === 0` for every
  other table. The expected set is written out in the test, not read from
  `taproom_can`, so the test and the predicate are two independent copies of
  the decision and drift between them fails. A table with no seeded row is a
  test failure, not a pass, so a new table cannot slip in unclassified.
- `it("scopes the location-bound tables to taproom rows")` asserts the
  warehouse-location rows of `inventory_movements`, `bins`, `taproom_pars` and
  `locations` are absent while the taproom rows are present.
- `it("writes only through its RPCs")` calls every RPC in
  `tests/rpc-allowlist.test.ts`'s list as the taproom user with valid existing owned resources and correctly typed
  arguments and expects `42501` from all but the nine named above, which are
  proven with actual effects and replay; own/foreign identity boundaries are tested. `tests/rls-command-boundary.test.ts` gains a `taproom` column in
  its role matrix for the same nine.
- `it("the four existing roles are unchanged")` runs the admin assertions of
  `tests/rls-tenancy.test.ts` against the narrowed `is_staff_of`, so the
  rewrite of one function is proven not to have moved anyone else.

`tests/schema-rls-indexes.test.ts` keeps the location-scoped policies
index-backed: the `location_id in (select …)` branch is served by the
existing `movements_onhand_idx` and the bins unique constraint; no new index
is needed.

## Consequences and non-goals

- A bartender sees taproom stock as numbers on the board and the count sheet
  only; there is no Inventory page for the role and no direct movement entry.
- Two taproom locations at one brewery share one bartender view; per-location
  staffing is a later refinement (a `location_id` on `brewery_users`) and is
  not designed here.
- The role reads sales at the POS level (`pos_sales`) so the variance screen
  can explain a gap, but never `orders` or `invoices`.
- Nothing here is a migration: the change is one edit to the baseline, per
  `AGENTS.md`, landed by Program 12's first task together with its test. The
  Program 12 plan's header line "`staff_role = taproom` is not added" is
  superseded by this document and §16.16 item 3.
