-- A case is six four-packs (docs/plans/square-packaged-menu.md). The menu sells
-- case stock as four-packs through format_components, so a Case that already
-- holds stock must be able to compose. Its typed volume is frozen once in use
-- (#632), so it cannot be cleared; it may stay when it equals its contents'
-- total. format_volumes reads the typed volume first, so both agree.
-- Tolerance: a case typed to 8 places differs from 6 × a four-pack's by 1e-8.
-- Same signature as the baseline, so create or replace keeps its grants.
create or replace function public.replace_format_components(p_brewery uuid, p_format uuid, p_components jsonb, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_parent public.formats; c record; v_child public.formats; v_total numeric;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'replace_format_components', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'format', p_format, 'components', p_components));
  if v_replay is not null then return v_replay; end if;
  select * into v_parent from public.formats where id = p_format and brewery_id = p_brewery for update;
  if v_parent.id is null then raise exception 'format not found'; end if;
  if v_parent.basis <> 'packaged' then raise exception 'only a packaged format composes'; end if;
  if exists (select 1 from public.format_components where child_format_id = p_format) then
    raise exception 'one level only: this format is already a component of another';
  end if;
  delete from public.format_components where parent_format_id = p_format;
  for c in select (e->>'child_format_id')::uuid as child, (e->>'qty')::numeric as qty from jsonb_array_elements(coalesce(p_components, '[]'::jsonb)) e loop
    select * into v_child from public.formats where id = c.child and brewery_id = p_brewery;
    if v_child.id is null then raise exception 'child format not found'; end if;
    if v_child.id = p_format then raise exception 'a format cannot contain itself (cycle)'; end if;
    if v_child.basis <> 'packaged' or v_child.bbl_per_unit is null
       or exists (select 1 from public.format_components where parent_format_id = v_child.id) then
      raise exception 'one level only: children must be atomic packaged formats (a cycle or a composed child is refused)';
    end if;
    insert into public.format_components (brewery_id, parent_format_id, child_format_id, qty) values (p_brewery, p_format, c.child, c.qty);
  end loop;
  if v_parent.bbl_per_unit is not null then
    select sum(fc.qty * f.bbl_per_unit) into v_total from public.format_components fc
      join public.formats f on f.id = fc.child_format_id where fc.parent_format_id = p_format;
    if v_total is not null and abs(v_total - v_parent.bbl_per_unit) > 0.000001 then
      raise exception 'contents volume % bbl does not match this format''s volume % bbl', v_total, v_parent.bbl_per_unit;
    end if;
  end if;
  return private.complete_command_request(p_request_id,
    (select to_jsonb(v) from public.format_volumes v where v.id = p_format));
end $$;

-- The menu snapshot adds `packaged`: case stock in the menu bin offered as
-- four-packs. Pours keep `items`/`excluded` unchanged, so the poured Square
-- publication reads exactly what it read before.
CREATE OR REPLACE FUNCTION private.pos_menu_snapshot (
  p_menu uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  WITH menu AS (
    SELECT m.* FROM public.pos_menus m
    JOIN public.pos_connections c ON c.id=m.connection_id AND c.brewery_id=m.brewery_id
      AND c.provider='square' AND c.state='connected'
    JOIN public.pos_locations pl ON pl.connection_id=m.connection_id
      AND pl.external_location_id=m.external_location_id AND pl.brewery_id=m.brewery_id
      AND pl.location_id=m.location_id AND pl.available
    WHERE m.id=p_menu
  ),
  source_rows AS (
    SELECT s.brand_id,s.id sku_id,s.name sku_name,f.name format_name,sum(im.qty) qty
    FROM menu m
    JOIN public.skus s ON s.brewery_id=m.brewery_id AND s.active
    JOIN public.formats f ON f.id=s.format_id AND f.brewery_id=s.brewery_id
      AND f.basis='packaged' AND f.package_type='keg'
    JOIN public.inventory_movements im ON im.brewery_id=s.brewery_id AND im.sku_id=s.id
      AND im.location_id=m.location_id AND im.bin_id=m.bin_id
    GROUP BY s.brand_id,s.id,s.name,f.name
    HAVING sum(im.qty)>0
  ),
  poured AS (
    SELECT f.id format_id,b.id brand_id,f.name format_name,f.ounces,b.name brand_name,
      l.price_override_cents,l.website_published_at,
      coalesce(l.price_override_cents,cp.unit_price_cents) price_cents,
      CASE WHEN l.price_override_cents IS NOT NULL THEN 'override'
        WHEN cp.unit_price_cents IS NOT NULL THEN 'format' ELSE 'none' END price_source,
      EXISTS(SELECT 1 FROM source_rows sr WHERE sr.brand_id=b.id) available,
      EXISTS(SELECT 1 FROM public.skus s JOIN public.formats sf ON sf.id=s.format_id AND sf.brewery_id=s.brewery_id
        WHERE s.brewery_id=f.brewery_id AND s.brand_id=b.id AND s.active
          AND sf.basis='packaged' AND sf.package_type='keg') has_active_keg,
      coalesce((SELECT jsonb_agg(jsonb_build_object('skuId',sr.sku_id,'name',sr.sku_name,'format',sr.format_name,'qty',sr.qty)
        ORDER BY sr.sku_name,sr.sku_id) FROM source_rows sr WHERE sr.brand_id=b.id),'[]'::jsonb) sources
    FROM menu m
    JOIN public.formats f ON f.brewery_id=m.brewery_id AND f.basis='poured'
    JOIN public.brands b ON b.price_group_id=f.price_group_id AND b.brewery_id=f.brewery_id
    LEFT JOIN public.channel_prices cp ON cp.brewery_id=m.brewery_id AND cp.sale_channel_id=m.sale_channel_id
      AND cp.price_group_id=b.price_group_id AND cp.format_id=f.id
    LEFT JOIN public.pos_menu_lines l ON l.menu_id=m.id AND l.format_id=f.id AND l.brand_id=b.id AND l.brewery_id=m.brewery_id
  ),
  -- A composed SKU (Case = 6 × Four Pack) in the menu bin sells as its child
  -- format: one row per beer and child, qty = whole child units in stock.
  -- A beer with two such SKUs sums them; skuId (for sale mapping) is the first.
  packaged AS (
    SELECT s.brand_id,b.name brand_name,cf.id format_id,cf.name format_name,min(s.id::text)::uuid sku_id,
      floor(greatest(coalesce(sum(st.qty*fc.qty),0),0))::integer qty,cp.unit_price_cents price_cents
    FROM menu m
    JOIN public.skus s ON s.brewery_id=m.brewery_id AND s.active
    JOIN public.format_components fc ON fc.parent_format_id=s.format_id AND fc.brewery_id=s.brewery_id
    JOIN public.formats cf ON cf.id=fc.child_format_id AND cf.brewery_id=fc.brewery_id
    JOIN public.brands b ON b.id=s.brand_id AND b.brewery_id=s.brewery_id
    LEFT JOIN LATERAL (SELECT sum(im.qty) qty FROM public.inventory_movements im
      WHERE im.brewery_id=s.brewery_id AND im.sku_id=s.id AND im.location_id=m.location_id AND im.bin_id=m.bin_id) st ON true
    LEFT JOIN public.channel_prices cp ON cp.brewery_id=m.brewery_id AND cp.sale_channel_id=m.sale_channel_id
      AND cp.price_group_id=b.price_group_id AND cp.format_id=cf.id
    GROUP BY s.brand_id,b.name,cf.id,cf.name,cp.unit_price_cents
  ),
  external_rows AS (
    SELECT v.external_item_id,v.external_variation_id,v.external_item_name,v.external_variation_name,v.available,
      CASE WHEN map.ignored THEN 'ignored' WHEN map.connection_id IS NULL THEN 'queued' ELSE 'mapped' END disposition
    FROM menu m
    JOIN public.pos_catalog_variations v ON v.connection_id=m.connection_id AND v.brewery_id=m.brewery_id
    LEFT JOIN public.pos_item_mappings map ON map.connection_id=v.connection_id
      AND map.external_item_id=v.external_item_id AND map.external_variation_id=v.external_variation_id
    WHERE map.connection_id IS NULL OR map.ignored
  )
  SELECT jsonb_build_object(
    'publicId',m.public_id,
    'location',jsonb_build_object('id',m.location_id,'name',loc.name,'posLocationId',m.external_location_id),
    'bin',jsonb_build_object('id',m.bin_id,'name',bin.name),
    'channel',jsonb_build_object('id',m.sale_channel_id,'name',ch.name),
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'brandId',p.brand_id,'formatId',p.format_id,'brand',p.brand_name,'format',p.format_name,'ounces',p.ounces,
      'priceCents',p.price_cents,'priceOverrideCents',p.price_override_cents,'priceSource',p.price_source,
      'available',true,'websitePublished',p.website_published_at IS NOT NULL,'sources',p.sources)
      ORDER BY p.brand_name,p.format_name,p.format_id) FROM poured p WHERE p.available),'[]'::jsonb),
    'excluded',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'brandId',p.brand_id,'formatId',p.format_id,'brand',p.brand_name,'format',p.format_name,'ounces',p.ounces,
      'priceCents',p.price_cents,'priceOverrideCents',p.price_override_cents,'priceSource',p.price_source,
      'available',false,'websitePublished',p.website_published_at IS NOT NULL,'sources',p.sources,
      'reason',CASE WHEN p.has_active_keg THEN 'out_of_stock' ELSE 'no_active_keg' END)
      ORDER BY p.brand_name,p.format_name,p.format_id) FROM poured p WHERE NOT p.available),'[]'::jsonb),
    'packaged',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'brandId',p.brand_id,'skuId',p.sku_id,'formatId',p.format_id,'brand',p.brand_name,'format',p.format_name,
      'qty',p.qty,'priceCents',p.price_cents,'available',p.qty>0)
      ORDER BY p.brand_name,p.format_name,p.format_id) FROM packaged p),'[]'::jsonb),
    'externalItems',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'externalItemId',e.external_item_id,'externalVariationId',e.external_variation_id,
      'itemName',e.external_item_name,'variationName',e.external_variation_name,
      'available',e.available,'disposition',e.disposition)
      ORDER BY e.external_item_name,e.external_variation_name,e.external_item_id,e.external_variation_id) FROM external_rows e),'[]'::jsonb)
  ) FROM menu m
  JOIN public.locations loc ON loc.id=m.location_id AND loc.brewery_id=m.brewery_id
  JOIN public.bins bin ON bin.id=m.bin_id AND bin.brewery_id=m.brewery_id
  JOIN public.sale_channels ch ON ch.id=m.sale_channel_id AND ch.brewery_id=m.brewery_id;
$function$;
