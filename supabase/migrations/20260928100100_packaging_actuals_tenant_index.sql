-- Keep tenant-scoped RLS reads of packaging actuals indexed.
create index packaging_material_actuals_brewery_record
  on public.packaging_material_actuals (brewery_id, record_id);
