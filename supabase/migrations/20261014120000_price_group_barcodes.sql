-- Price group barcodes (docs/plans/price-group-barcodes.md): a UPC per price
-- group × format, the follow-on table spec 2026-09-07-mgr-price-groups.md D3
-- deferred. Every SKU on the group scans as the group's code for its format,
-- unless the SKU carries its own skus.upc (D2 amended, 2026-10-14). A format
-- with no row has no group code; that is a finished state (D4), not missing setup.

create table public.price_group_barcodes (
  brewery_id uuid not null references public.breweries(id),
  price_group_id uuid not null,
  format_id uuid not null,
  upc text not null check (upc ~ '^(\d{8}|\d{12,14})$'),
  -- channel_prices' key shape: brewery_id stays out of the key, so PostgREST
  -- does not read this table as a formats↔price_groups link and every existing
  -- formats → price_groups embed stays unambiguous. The upsert guards the tenant.
  primary key (price_group_id, format_id),
  -- A barcode keeps nothing alive: it leaves with its group.
  foreign key (price_group_id, brewery_id) references public.price_groups (id, brewery_id) on delete cascade,
  foreign key (format_id, brewery_id) references public.formats (id, brewery_id) on delete restrict
);
-- No unique on upc: one group's code may cover several formats (one can label).
-- The read filters brewery_id (RLS and list_price_group_barcodes); the format
-- index serves the format FK's on-delete check.
create index price_group_barcodes_brewery_idx on public.price_group_barcodes (brewery_id, price_group_id);
create index price_group_barcodes_format_idx on public.price_group_barcodes (format_id, brewery_id);

alter table public.price_group_barcodes enable row level security;
-- The same staff read as channel_prices (20261008170000_staff_role_business_reads.sql:42).
create policy staff_read on public.price_group_barcodes for select to authenticated
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales']::public.staff_role[])));
grant select on public.price_group_barcodes to authenticated;
grant all on public.price_group_barcodes to service_role;

-- Set one group × format code; a null or blank p_upc clears it. Packaged formats
-- only: a pour never scans.
create function public.set_price_group_barcode(p_brewery uuid, p_price_group uuid, p_format uuid, p_upc text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.price_group_barcodes; v_n int;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  p_upc := private.normalize_upc(p_upc);
  v_replay := private.claim_command_request(p_brewery, 'set_price_group_barcode', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'price_group', p_price_group, 'format', p_format, 'upc', p_upc));
  if v_replay is not null then return v_replay; end if;
  if not exists (select 1 from public.price_groups where id = p_price_group and brewery_id = p_brewery)
    then raise exception 'price group not found' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.formats where id = p_format and brewery_id = p_brewery and basis = 'packaged')
    then raise exception 'a barcode needs a packaged format of this brewery' using errcode = 'P0001'; end if;
  if p_upc is null then
    delete from public.price_group_barcodes where brewery_id = p_brewery and price_group_id = p_price_group and format_id = p_format;
    get diagnostics v_n = row_count;
    return private.complete_command_request(p_request_id, jsonb_build_object('cleared', v_n > 0));
  end if;
  insert into public.price_group_barcodes (brewery_id, price_group_id, format_id, upc)
    values (p_brewery, p_price_group, p_format, p_upc)
    on conflict (price_group_id, format_id) do update set upc = excluded.upc
      where public.price_group_barcodes.brewery_id = excluded.brewery_id
    returning * into v_row;
  -- The group was checked as this brewery's above, so the guard cannot skip;
  -- the not-found turns it into a refusal rather than a silent no-op if it ever did.
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.set_price_group_barcode(uuid, uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_price_group_barcode(uuid, uuid, uuid, text, uuid) to authenticated;
