-- Coverage freezes the MGR location observed in an interval. A retirement must
-- not make that historic location follow the current provider mapping.
alter table public.pos_sales_coverage
  drop constraint pos_sales_coverage_connection_id_external_location_id_loca_fkey,
  add constraint pos_sales_coverage_source_fkey foreign key(connection_id,external_location_id)
    references public.pos_locations(connection_id,external_location_id),
  add constraint pos_sales_coverage_connection_tenant_fkey foreign key(connection_id,brewery_id)
    references public.pos_connections(id,brewery_id),
  add constraint pos_sales_coverage_location_tenant_fkey foreign key(location_id,brewery_id)
    references public.locations(id,brewery_id);
