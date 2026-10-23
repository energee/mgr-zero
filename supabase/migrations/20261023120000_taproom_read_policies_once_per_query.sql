-- #1198: the staff_read policies that also admit taproom staff called
-- taproom_can(brewery_id, '<table>') for each row that the first branch
-- refused, which is every other brewery's row. taproom_can is SECURITY
-- DEFINER, so Postgres cannot inline it. Each call runs three nested functions
-- and request_scope_allows' subtransaction, about 0.4 ms. Right after a bulk
-- insert, lagging statistics can pick a nested loop that rescans skus per
-- ledger row. get_bin_move_stock over 1,001 rows then passed the 8 s
-- statement timeout in CI.
--
-- 20261022080000 moved the other staff roles to
-- `brewery_id in (select my_staff_brewery_ids(...))`: a hashed subplan that
-- runs once per query. This migration adds 'taproom' to that list. Same rule:
-- taproom_can(b, t) is true when the caller has the taproom role at b and
-- request_scope_allows(b), and t is one of its tables. my_staff_brewery_ids
-- applies the same two checks. The location filters on bins, locations and
-- taproom_pars stay as they were.
--
-- pos_sale_expectations and pos_sales_coverage are not taproom_can tables,
-- so its branch there was always false. They drop it. Taproom staff still
-- read neither table (tests/rls-fixtures.ts: "deny").
alter policy staff_read on public.brands using (
  brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer','taproom']::public.staff_role[]))
);
alter policy staff_read on public.formats using (
  brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer','taproom']::public.staff_role[]))
);
alter policy staff_read on public.format_components using (
  brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer','taproom']::public.staff_role[]))
);
alter policy staff_read on public.keg_pools using (
  brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer','taproom']::public.staff_role[]))
);
alter policy staff_read on public.skus using (
  brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer','taproom']::public.staff_role[]))
);
alter policy staff_read on public.tap_intervals using (
  brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer','taproom']::public.staff_role[]))
);
alter policy staff_read on public.taproom_counts using (
  brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer','taproom']::public.staff_role[]))
);
alter policy staff_read on public.taproom_count_lines using (
  brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer','taproom']::public.staff_role[]))
);
alter policy staff_read on public.pos_locations using (
  brewery_id in (select public.my_staff_brewery_ids(array['admin','warehouse','taproom']::public.staff_role[]))
);
alter policy staff_read on public.pos_item_mappings using (
  brewery_id in (select public.my_staff_brewery_ids(array['admin','warehouse','taproom']::public.staff_role[]))
);
alter policy staff_read on public.pos_sale_expectations using (
  brewery_id in (select public.my_staff_brewery_ids(array['admin','warehouse']::public.staff_role[]))
);
alter policy staff_read on public.pos_sales_coverage using (
  brewery_id in (select public.my_staff_brewery_ids(array['admin','warehouse']::public.staff_role[]))
);
-- Taproom staff see only locations put to taproom use, and their bins and pars.
alter policy staff_read on public.locations using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
  or (brewery_id in (select public.my_staff_brewery_ids(array['taproom']::public.staff_role[]))
      and 'taproom'::public.location_kind = any(uses))
);
alter policy staff_read on public.bins using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
  or (brewery_id in (select public.my_staff_brewery_ids(array['taproom']::public.staff_role[]))
      and location_id in (select l.id from public.locations l where 'taproom'::public.location_kind = any(l.uses)))
);
alter policy staff_read on public.taproom_pars using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
  or (brewery_id in (select public.my_staff_brewery_ids(array['taproom']::public.staff_role[]))
      and location_id in (select l.id from public.locations l where 'taproom'::public.location_kind = any(l.uses)))
);
