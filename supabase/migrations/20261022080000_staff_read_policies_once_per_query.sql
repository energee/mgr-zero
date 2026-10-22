-- staff_read policies (and brewery_users.member_read) checked staff access with
-- is_staff_of(brewery_id). It is SECURITY DEFINER, so Postgres cannot inline it,
-- and it runs once per row, including request_scope_allows' parse of the
-- request headers. Over 50,000 rows that took ~385 ms; the same rule written as
-- `brewery_id in (select my_staff_brewery_ids(<every staff role but taproom>))`
-- is a hashed subplan evaluated once per query (~4 ms). Both read brewery_users
-- for the caller with roles && {admin,sales,warehouse,brewer} and pass the
-- brewery through request_scope_allows, so who can read what is unchanged.
-- Only the USING expression changes; command, roles and names stay as they were.
alter policy staff_read on public.allocations using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.batch_additions using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.batches using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.bins using (
  ((brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[]))) OR (taproom_can(brewery_id, 'bins'::text) AND (location_id IN ( SELECT locations.id
   FROM locations
  WHERE ('taproom'::location_kind = ANY (locations.uses))))))
);
alter policy staff_read on public.brands using (
  ((brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[]))) OR taproom_can(brewery_id, 'brands'::text))
);
alter policy staff_read on public.brew_records using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.breweries using (
  (id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy member_read on public.brewery_users using (
  (((user_id = ( SELECT auth.uid() AS uid)) AND (brewery_id IN ( SELECT my_brewery_ids() AS my_brewery_ids))) OR (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[]))))
);
alter policy staff_read on public.catalog_categories using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.fermentation_readings using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.format_bom using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.format_components using (
  ((brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[]))) OR taproom_can(brewery_id, 'format_components'::text))
);
alter policy staff_read on public.formats using (
  ((brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[]))) OR taproom_can(brewery_id, 'formats'::text))
);
alter policy staff_read on public.inventory_movements using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.keg_events using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.keg_pools using (
  ((brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[]))) OR taproom_can(brewery_id, 'keg_pools'::text))
);
alter policy staff_read on public.locations using (
  ((brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[]))) OR (taproom_can(brewery_id, 'locations'::text) AND ('taproom'::location_kind = ANY (uses))))
);
alter policy staff_read on public.material_contracts using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.material_count_lines using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.material_counts using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.material_lots using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.material_movements using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.materials using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.packaging_material_actuals using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.packaging_material_records using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.packaging_run_consumptions using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.packaging_run_outputs using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.packaging_runs using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.price_groups using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.purchase_order_lines using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.purchase_orders using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.receipt_lines using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.receipts using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.recipe_ingredients using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.recipe_versions using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.recipe_water_additions using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.recipes using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.skus using (
  ((brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[]))) OR taproom_can(brewery_id, 'skus'::text))
);
alter policy staff_read on public.styles using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.tap_intervals using (
  ((brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[]))) OR taproom_can(brewery_id, 'tap_intervals'::text))
);
alter policy staff_read on public.taproom_count_lines using (
  ((brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[]))) OR taproom_can(brewery_id, 'taproom_count_lines'::text))
);
alter policy staff_read on public.taproom_counts using (
  ((brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[]))) OR taproom_can(brewery_id, 'taproom_counts'::text))
);
alter policy staff_read on public.taproom_pars using (
  ((brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[]))) OR (taproom_can(brewery_id, 'taproom_pars'::text) AND (location_id IN ( SELECT locations.id
   FROM locations
  WHERE ('taproom'::location_kind = ANY (locations.uses))))))
);
alter policy staff_read on public.transfers using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.vendors using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.vessel_occupancies using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.vessels using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.volume_adjustment_reclassifications using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.volume_adjustments using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
alter policy staff_read on public.water_profiles using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
