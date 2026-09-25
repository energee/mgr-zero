-- #490: an unpriced SKU on an order is refused by name, not by its id.
create or replace function private.order_line_price(p_brewery uuid, p_sale_channel uuid, p_sku uuid) returns int
language plpgsql stable set search_path = '' as $$
declare v int;
begin
  select p.unit_price_cents into v from public.sku_prices p
  where p.brewery_id = p_brewery and p.sale_channel_id = p_sale_channel and p.sku_id = p_sku and p.active;
  if v is null then
    raise exception '% is not active and priced for this customer',
      coalesce((select s.name from public.skus s where s.id = p_sku and s.brewery_id = p_brewery), 'A SKU');
  end if;
  return v;
end $$;
