-- #470: a poured format in use by POS data must stay poured. The baseline guard
-- only blocked packaged → poured; poured → packaged left POS item mappings,
-- menu lines, catalog ownership and sale expectations on a packaged format,
-- where every f.basis = 'poured' join silently dropped them.
create or replace function private.guard_format_basis() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.basis = 'poured' and old.basis <> new.basis and (
    exists (select 1 from public.skus where format_id = old.id)
    or exists (select 1 from public.format_components where parent_format_id = old.id or child_format_id = old.id)
    or exists (select 1 from public.format_bom where format_id = old.id)) then
    raise exception 'a format in use by a SKU, component or BOM must stay packaged';
  end if;
  if new.basis = 'packaged' and old.basis <> new.basis and (
    exists (select 1 from public.pos_item_mappings where format_id = old.id)
    or exists (select 1 from public.pos_menu_lines where format_id = old.id)
    or exists (select 1 from public.pos_catalog_ownership where format_id = old.id)
    or exists (select 1 from public.pos_sale_expectations where format_id = old.id)) then
    raise exception 'a format in use by a POS mapping, menu or sale must stay poured';
  end if;
  return new;
end $$;
