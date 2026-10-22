-- Menu's "Also in Square" lists only what needs a decision: an unmapped Square
-- variation that has sold at this location. An unsold or explicitly ignored
-- variation asks for nothing, so food and merch stop queuing work; MGR's own
-- published items are mapped at publish. The POS mapping page is gone, and this
-- list is where those decisions are made.

create index if not exists pos_sales_variation_location_idx
  on public.pos_sales (connection_id, external_variation_id, external_location_id);

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
  external_rows AS (
    SELECT v.external_item_id,v.external_variation_id,v.external_item_name,v.external_variation_name,v.available
    FROM menu m
    JOIN public.pos_catalog_variations v ON v.connection_id=m.connection_id AND v.brewery_id=m.brewery_id
    LEFT JOIN public.pos_item_mappings map ON map.connection_id=v.connection_id
      AND map.external_item_id=v.external_item_id AND map.external_variation_id=v.external_variation_id
    WHERE map.connection_id IS NULL
      AND EXISTS(SELECT 1 FROM public.pos_sales s WHERE s.connection_id=v.connection_id
        AND s.external_variation_id=v.external_variation_id AND s.external_location_id=m.external_location_id)
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
    'externalItems',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'externalItemId',e.external_item_id,'externalVariationId',e.external_variation_id,
      'itemName',e.external_item_name,'variationName',e.external_variation_name,
      'available',e.available)
      ORDER BY e.external_item_name,e.external_variation_name,e.external_item_id,e.external_variation_id) FROM external_rows e),'[]'::jsonb)
  ) FROM menu m
  JOIN public.locations loc ON loc.id=m.location_id AND loc.brewery_id=m.brewery_id
  JOIN public.bins bin ON bin.id=m.bin_id AND bin.brewery_id=m.brewery_id
  JOIN public.sale_channels ch ON ch.id=m.sale_channel_id AND ch.brewery_id=m.brewery_id;
$function$;
