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
    'packaged',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'brandId',p.brand_id,'skuId',p.sku_id,'formatId',p.format_id,'brand',p.brand_name,'format',p.format_name,
      'qty',p.qty,'priceCents',p.price_cents,'available',p.qty>0)
      ORDER BY p.brand_name,p.format_name,p.format_id) FROM packaged p),'[]'::jsonb),
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

-- Square publishes case stock as a second item per beer, "<Beer> Four Pack"
-- (catalog group 'packaged'), beside its poured item. Each variation carries
-- the Case SKU it sells from, so a Square sale maps to that SKU. The menu's
-- publication candidates become (brand, catalog group) pairs; a single-item
-- publish (publish_pos_item) stays poured. Same signatures, so grants hold.
alter table private.square_publication_events drop constraint square_publication_events_catalog_group_check;
alter table private.square_publication_events add constraint square_publication_events_catalog_group_check check (catalog_group in ('poured','packaged'));
alter table private.square_publications drop constraint square_publications_catalog_group_check;
alter table private.square_publications add constraint square_publications_catalog_group_check check (catalog_group in ('poured','packaged'));
alter table public.pos_catalog_items drop constraint pos_catalog_items_catalog_group_check;
alter table public.pos_catalog_items add constraint pos_catalog_items_catalog_group_check check (catalog_group in ('poured','packaged'));
alter table public.pos_catalog_ownership drop constraint pos_catalog_ownership_catalog_group_check;
alter table public.pos_catalog_ownership add constraint pos_catalog_ownership_catalog_group_check check (catalog_group in ('poured','packaged'));

CREATE OR REPLACE FUNCTION public.begin_square_menu_publication (
  p_brewery           uuid,
  p_external_location text,
  p_retry_conflict    boolean,
  p_request_id        uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE v_actor uuid; v_replay jsonb; v_connection public.pos_connections; v_menu public.pos_menus;
  v_attempt private.square_menu_publications; v_manifest jsonb; v_snapshot jsonb; v_candidates jsonb;
  v_result jsonb; v_entry jsonb;
BEGIN
  v_actor:=private.assert_staff(p_brewery,ARRAY['admin','warehouse']::public.staff_role[]);
  IF nullif(btrim(p_external_location),'') IS NULL OR p_retry_conflict IS NULL THEN
    RAISE EXCEPTION 'Square menu publication request is invalid'; END IF;
  v_replay:=private.claim_command_request_for(v_actor,p_brewery,'publish_pos_menu',p_request_id,
    jsonb_build_object('posLocationId',p_external_location,'retryConflict',p_retry_conflict));
  IF v_replay IS NOT NULL THEN
    SELECT * INTO v_attempt FROM private.square_menu_publications
      WHERE id=(v_replay->>'menuAttemptId')::uuid AND brewery_id=p_brewery;
    IF NOT FOUND THEN RAISE EXCEPTION 'Square menu publication request is invalid' USING errcode='MG409'; END IF;
    PERFORM private.supersede_square_publications(v_attempt.connection_id);
    RETURN private.square_menu_publication_state(v_attempt.id);
  END IF;
  SELECT c.* INTO v_connection FROM public.pos_connections c WHERE c.brewery_id=p_brewery
    AND c.provider='square' AND c.state='connected' FOR SHARE;
  SELECT m.* INTO v_menu FROM public.pos_menus m WHERE m.brewery_id=p_brewery
    AND m.external_location_id=p_external_location AND m.connection_id=v_connection.id FOR SHARE;
  IF v_connection.id IS NULL OR v_menu.id IS NULL THEN RAISE EXCEPTION 'Square menu is unavailable'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'square-menu-publish:'||v_connection.id::text||':'||p_external_location,0));
  PERFORM private.supersede_square_publications(v_connection.id);
  IF EXISTS(SELECT 1 FROM private.square_catalog_syncs s JOIN private.command_requests r
    ON r.actor_id=s.actor_id AND r.request_id=s.request_id
    WHERE s.connection_id=v_connection.id AND s.merchant_id=v_connection.merchant_id
      AND s.catalog_generation>v_connection.catalog_sync_generation
      AND r.result IS NULL) THEN
    RAISE EXCEPTION 'Square catalog sync is still in progress' USING errcode='MG409'; END IF;
  IF EXISTS(SELECT 1 FROM private.square_menu_publications p WHERE p.connection_id=v_connection.id
    AND p.external_location_id=p_external_location AND p.status='publishing') THEN
    RAISE EXCEPTION 'Another Square menu publication is still unresolved' USING errcode='MG409'; END IF;
  v_snapshot:=private.pos_menu_snapshot(v_menu.id);
  SELECT coalesce(jsonb_agg(jsonb_build_object('brandId',brand_id,'catalogGroup',catalog_group)
      ORDER BY brand_id,catalog_group),'[]'::jsonb) INTO v_candidates FROM (
      SELECT DISTINCT (e->>'brandId')::uuid brand_id,'poured' catalog_group
      FROM jsonb_array_elements((v_snapshot->'items')||(v_snapshot->'excluded')) e
      WHERE coalesce((e->>'available')::boolean,false) AND e->>'priceCents' IS NOT NULL
      UNION
      SELECT DISTINCT (e->>'brandId')::uuid,'packaged' FROM jsonb_array_elements(v_snapshot->'packaged') e
      WHERE coalesce((e->>'available')::boolean,false) AND e->>'priceCents' IS NOT NULL
      UNION
      SELECT i.brand_id,i.catalog_group FROM public.pos_catalog_items i WHERE i.connection_id=v_connection.id
    ) brands;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_candidates)
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'square-publish:'||v_connection.id::text||':'||(v_entry->>'brandId')||':'||(v_entry->>'catalogGroup'),0));
  END LOOP;
  v_manifest:=private.square_menu_publication_manifest(v_snapshot,v_connection.id,v_candidates);
  INSERT INTO private.square_menu_publications(brewery_id,connection_id,actor_id,request_id,
    credential_version,catalog_generation,external_location_id,retry_conflict,manifest)
  VALUES(p_brewery,v_connection.id,v_actor,p_request_id,v_connection.credential_version,
    v_connection.catalog_sync_generation,p_external_location,p_retry_conflict,v_manifest) RETURNING * INTO v_attempt;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_manifest)
  LOOP
    PERFORM public.begin_square_publication(p_brewery,p_external_location,(v_entry->>'brandId')::uuid,
      null,null,p_retry_conflict,'publish_pos_menu',(v_entry->>'requestId')::uuid,v_attempt.id);
  END LOOP;
  v_result:=private.square_menu_publication_state(v_attempt.id);
  PERFORM private.complete_command_request_for(v_actor,p_request_id,v_result);
  RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION private.square_menu_publication_manifest(p_snapshot jsonb, p_connection uuid, p_candidates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_snapshot jsonb:=p_snapshot; v_manifest jsonb:='[]'::jsonb; v_brand uuid; v_brand_name text;
  v_external_item text; v_ownership text; v_variations jsonb; v_group text; v_rows jsonb;
BEGIN
  FOR v_brand,v_group IN
    SELECT (value->>'brandId')::uuid,value->>'catalogGroup' FROM jsonb_array_elements(p_candidates)
    ORDER BY (value->>'brandId')::uuid,value->>'catalogGroup'
  LOOP
    v_external_item:=null; v_ownership:='mgr';
    v_rows:=CASE v_group WHEN 'poured' THEN (v_snapshot->'items')||(v_snapshot->'excluded') ELSE v_snapshot->'packaged' END;
    SELECT i.external_item_id,i.ownership INTO v_external_item,v_ownership
      FROM public.pos_catalog_items i WHERE i.connection_id=p_connection
        AND i.brand_id=v_brand AND i.catalog_group=v_group;
    IF NOT FOUND THEN v_external_item:=null; v_ownership:='mgr'; END IF;
    SELECT b.name INTO v_brand_name FROM public.brands b WHERE b.id=v_brand;
    WITH source_rows AS (
      SELECT e->>'formatId' format_id,e->>'format' format_name,e->>'skuId' sku_id,
        CASE WHEN e->>'priceCents' IS NULL THEN null ELSE (e->>'priceCents')::integer END price_cents,
        coalesce((e->>'available')::boolean,false) AND e->>'priceCents' IS NOT NULL present
      FROM jsonb_array_elements(v_rows) e
      WHERE e->>'brandId'=v_brand::text
      UNION ALL
      SELECT o.format_id::text,f.name,m.sku_id::text,null::integer,false
      FROM public.pos_catalog_ownership o JOIN public.formats f ON f.id=o.format_id AND f.brewery_id=o.brewery_id
      LEFT JOIN public.pos_item_mappings m ON m.connection_id=o.connection_id
        AND m.external_item_id=o.external_item_id AND m.external_variation_id=o.external_variation_id
      WHERE o.connection_id=p_connection AND o.brand_id=v_brand AND o.catalog_group=v_group
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_rows) e
          WHERE e->>'formatId'=o.format_id::text AND e->>'brandId'=v_brand::text)
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('formatId',s.format_id,'format',s.format_name,
      'priceCents',s.price_cents,'present',s.present,'externalVariationId',o.external_variation_id)
      || CASE v_group WHEN 'packaged' THEN jsonb_build_object('skuId',s.sku_id) ELSE '{}'::jsonb END
      ORDER BY s.format_name,s.format_id),'[]'::jsonb),
      CASE v_group WHEN 'packaged' THEN v_brand_name||' '||min(s.format_name) ELSE v_brand_name END
      INTO v_variations,v_brand_name
    FROM source_rows s LEFT JOIN public.pos_catalog_ownership o ON o.connection_id=p_connection
      AND o.brand_id=v_brand AND o.catalog_group=v_group AND o.format_id=s.format_id::uuid
      AND o.external_item_id=v_external_item;
    v_manifest:=v_manifest||jsonb_build_array(jsonb_build_object('brandId',v_brand,'requestId',private.new_uuid(),
      'source',jsonb_build_object('brandId',v_brand,'brand',v_brand_name,'catalogGroup',v_group,
        'locationId',v_snapshot#>>'{location,posLocationId}','ownership',v_ownership,
        'externalItemId',v_external_item,'variations',v_variations)));
  END LOOP;
  RETURN v_manifest;
END $function$;

CREATE OR REPLACE FUNCTION public.begin_square_publication (
  p_brewery           uuid,
  p_external_location text,
  p_brand             uuid,
  p_adopt_item        text,
  p_adopt_variation   text,
  p_retry_conflict    boolean,
  p_command           text,
  p_request_id        uuid,
  p_menu_publication  uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE v_actor uuid; v_replay jsonb; v_connection public.pos_connections; v_menu public.pos_menus;
  v_parent public.pos_catalog_items; v_attempt private.square_publications; v_snapshot jsonb; v_variations jsonb;
  v_ownership text; v_result jsonb; v_previous private.square_publications; v_external_item text; v_brand_name text;
  v_menu_attempt private.square_menu_publications; v_manifest_entry jsonb; v_group text;
BEGIN
  v_actor:=private.assert_staff(p_brewery,ARRAY['admin','warehouse']::public.staff_role[]);
  IF p_command NOT IN ('publish_pos_menu','publish_pos_item') OR p_retry_conflict IS NULL
    OR (p_command='publish_pos_menu')<>(p_menu_publication IS NOT NULL)
    OR (p_adopt_item IS NULL)<>(p_adopt_variation IS NULL) OR p_brand IS NULL
    OR nullif(btrim(p_external_location),'') IS NULL THEN RAISE EXCEPTION 'Square publication request is invalid'; END IF;
  v_replay:=private.claim_command_request_for(v_actor,p_brewery,p_command,p_request_id,
    jsonb_strip_nulls(jsonb_build_object('posLocationId',p_external_location,'brandId',p_brand,
      'adoptItemId',p_adopt_item,'adoptVariationId',p_adopt_variation,'retryConflict',p_retry_conflict,
      'menuPublicationId',p_menu_publication)));
  IF v_replay IS NOT NULL THEN
    SELECT * INTO v_attempt FROM private.square_publications WHERE id=(v_replay->>'attemptId')::uuid AND brewery_id=p_brewery;
    IF NOT FOUND THEN RAISE EXCEPTION 'Square publication request is invalid' USING errcode='MG409'; END IF;
    RETURN private.square_publication_state(v_attempt.id);
  END IF;
  SELECT c.* INTO v_connection FROM public.pos_connections c WHERE c.brewery_id=p_brewery
    AND c.provider='square' AND c.state='connected' FOR SHARE;
  SELECT m.* INTO v_menu FROM public.pos_menus m WHERE m.brewery_id=p_brewery
    AND m.external_location_id=p_external_location AND m.connection_id=v_connection.id FOR SHARE;
  IF v_connection.id IS NULL OR v_menu.id IS NULL THEN RAISE EXCEPTION 'Square menu is unavailable'; END IF;
  -- An unknown menu entry leaves v_group null; the manifest check below rejects it.
  v_group:=CASE WHEN p_menu_publication IS NULL THEN 'poured' ELSE (SELECT e#>>'{source,catalogGroup}'
    FROM private.square_menu_publications p,jsonb_array_elements(p.manifest) e
    WHERE p.id=p_menu_publication AND p.brewery_id=p_brewery AND e->>'requestId'=p_request_id::text) END;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('square-publish:'||v_connection.id::text||':'||p_brand::text||':'||v_group,0));
  PERFORM private.supersede_square_publications(v_connection.id);
  IF EXISTS(SELECT 1 FROM private.square_catalog_syncs s JOIN private.command_requests r
    ON r.actor_id=s.actor_id AND r.request_id=s.request_id
    WHERE s.connection_id=v_connection.id AND s.merchant_id=v_connection.merchant_id
      AND s.catalog_generation>v_connection.catalog_sync_generation
      AND r.result IS NULL) THEN
    RAISE EXCEPTION 'Square catalog sync is still in progress' USING errcode='MG409'; END IF;
  IF p_menu_publication IS NOT NULL THEN
    SELECT * INTO v_menu_attempt FROM private.square_menu_publications p
      WHERE p.id=p_menu_publication AND p.brewery_id=p_brewery AND p.connection_id=v_connection.id
        AND p.actor_id=v_actor AND p.external_location_id=p_external_location AND p.status='publishing'
        AND p.credential_version=v_connection.credential_version
        AND p.catalog_generation=v_connection.catalog_sync_generation FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Square menu publication was superseded' USING errcode='MG409'; END IF;
    SELECT e INTO v_manifest_entry FROM jsonb_array_elements(v_menu_attempt.manifest) e
      WHERE e->>'brandId'=p_brand::text AND e->>'requestId'=p_request_id::text;
    IF NOT FOUND THEN RAISE EXCEPTION 'Square menu publication request is invalid' USING errcode='MG409'; END IF;
  END IF;
  SELECT * INTO v_attempt FROM private.square_publications p WHERE p.connection_id=v_connection.id
    AND p.brand_id=p_brand AND p.catalog_group=v_group AND p.status IN ('needs_snapshot','prepared') FOR UPDATE;
  IF FOUND THEN
    IF v_attempt.external_location_id IS DISTINCT FROM p_external_location
      OR v_attempt.menu_publication_id IS DISTINCT FROM p_menu_publication
      OR p_adopt_item IS NOT NULL AND (p_adopt_item IS DISTINCT FROM v_attempt.external_item_id
      OR p_adopt_variation IS DISTINCT FROM v_attempt.adopt_variation_id)
    THEN RAISE EXCEPTION 'Another Square publication is still unresolved' USING errcode='MG409'; END IF;
    v_result:=private.square_publication_state(v_attempt.id);
    PERFORM private.complete_command_request_for(v_actor,p_request_id,v_result);
    RETURN v_result;
  END IF;
  IF p_menu_publication IS NOT NULL THEN
    v_snapshot:=v_manifest_entry->'source';
    v_ownership:=v_snapshot->>'ownership'; v_external_item:=v_snapshot->>'externalItemId';
    v_brand_name:=v_snapshot->>'brand'; v_variations:=v_snapshot->'variations';
  ELSE
    SELECT * INTO v_parent FROM public.pos_catalog_items i WHERE i.connection_id=v_connection.id
      AND i.brand_id=p_brand AND i.catalog_group='poured' FOR SHARE;
    IF p_adopt_item IS NOT NULL THEN
      IF NOT EXISTS(SELECT 1 FROM public.pos_catalog_variations v
        JOIN public.pos_item_mappings m ON m.connection_id=v.connection_id AND m.external_item_id=v.external_item_id
          AND m.external_variation_id=v.external_variation_id AND NOT m.ignored AND m.format_id IS NOT NULL
        JOIN public.formats f ON f.id=m.format_id AND f.brewery_id=m.brewery_id AND f.basis='poured' AND f.price_group_id=(SELECT price_group_id FROM public.brands WHERE id=p_brand AND brewery_id=p_brewery)
        WHERE v.brewery_id=p_brewery AND v.connection_id=v_connection.id AND v.external_item_id=p_adopt_item
          AND v.external_variation_id=p_adopt_variation AND v.available)
      THEN RAISE EXCEPTION 'Square adoption must select one observed mapped brand variation'; END IF;
      IF v_parent.connection_id IS NOT NULL THEN
        IF v_parent.external_item_id<>p_adopt_item THEN
          RAISE EXCEPTION 'MGR already owns a different Square item for this brand' USING errcode='MG409'; END IF;
        IF EXISTS(SELECT 1 FROM public.pos_item_mappings m
          JOIN public.pos_catalog_ownership o ON o.connection_id=m.connection_id AND o.format_id=m.format_id
            AND o.brand_id=p_brand AND o.catalog_group='poured' AND o.external_item_id=p_adopt_item
          WHERE m.connection_id=v_connection.id AND m.external_item_id=p_adopt_item
            AND m.external_variation_id=p_adopt_variation AND NOT m.ignored
            AND o.external_variation_id<>p_adopt_variation)
        THEN RAISE EXCEPTION 'MGR already owns a different Square variation for this format' USING errcode='MG409'; END IF;
        v_ownership:=v_parent.ownership; v_external_item:=v_parent.external_item_id;
      ELSE
        IF EXISTS(SELECT 1 FROM public.pos_catalog_items i WHERE i.connection_id=v_connection.id AND i.external_item_id=p_adopt_item)
        THEN RAISE EXCEPTION 'Square adoption must select one observed mapped brand variation'; END IF;
        v_ownership:='adopted'; v_external_item:=p_adopt_item;
      END IF;
    ELSIF v_parent.connection_id IS NOT NULL THEN
      v_ownership:=v_parent.ownership; v_external_item:=v_parent.external_item_id;
    ELSE v_ownership:='mgr';
    END IF;
    v_snapshot:=private.pos_menu_snapshot(v_menu.id);
    SELECT b.name INTO v_brand_name FROM public.brands b WHERE b.id=p_brand AND b.brewery_id=p_brewery;
    SELECT jsonb_agg(jsonb_build_object('formatId',x.value->>'formatId','format',x.value->>'format',
        'priceCents',CASE WHEN x.value->>'priceCents' IS NULL THEN null ELSE (x.value->>'priceCents')::integer END,
        'present',coalesce((x.value->>'available')::boolean,false) AND x.value->>'priceCents' IS NOT NULL,
        'externalVariationId',coalesce(o.external_variation_id,CASE WHEN p_adopt_variation IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.pos_item_mappings m WHERE m.connection_id=v_connection.id
            AND m.external_item_id=p_adopt_item AND m.external_variation_id=p_adopt_variation
            AND m.format_id=(x.value->>'formatId')::uuid AND NOT m.ignored) THEN p_adopt_variation END))
        ORDER BY x.value->>'format',x.value->>'formatId') INTO v_variations
    FROM jsonb_array_elements((v_snapshot->'items')||(v_snapshot->'excluded')) x(value)
    LEFT JOIN public.pos_catalog_ownership o ON o.connection_id=v_connection.id AND o.format_id=(x.value->>'formatId')::uuid
      AND o.brand_id=p_brand AND o.catalog_group='poured' AND o.external_item_id=v_external_item
    WHERE x.value->>'brandId'=p_brand::text;
  END IF;
  IF v_brand_name IS NULL OR (v_external_item IS NULL AND (jsonb_array_length(coalesce(v_variations,'[]'::jsonb))=0
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_variations) e WHERE coalesce((e->>'present')::boolean,false))))
  THEN RAISE EXCEPTION 'Only a brand with a priced available format can create a Square item'; END IF;
  SELECT * INTO v_previous FROM private.square_publications p WHERE p.connection_id=v_connection.id
    AND p.brand_id=p_brand AND p.catalog_group=v_group ORDER BY p.created_at DESC,p.id DESC LIMIT 1;
  IF v_previous.status='rejected' AND v_previous.error_code='version_mismatch' AND NOT p_retry_conflict THEN
    RAISE EXCEPTION 'Square changed this item; retry requires current version confirmation' USING errcode='MG409'; END IF;
  INSERT INTO private.square_publications(brewery_id,connection_id,actor_id,menu_publication_id,request_id,command_name,
    credential_version,catalog_generation,external_location_id,brand_id,catalog_group,ownership_intent,
    external_item_id,adopt_variation_id,source_snapshot)
  VALUES(p_brewery,v_connection.id,v_actor,p_menu_publication,p_request_id,p_command,v_connection.credential_version,
    v_connection.catalog_sync_generation,p_external_location,p_brand,v_group,v_ownership,v_external_item,p_adopt_variation,
    CASE WHEN p_menu_publication IS NULL THEN jsonb_build_object('brandId',p_brand,'brand',v_brand_name,
      'catalogGroup','poured','locationId',p_external_location,'ownership',v_ownership,
      'externalItemId',v_external_item,'variations',v_variations) ELSE v_snapshot END) RETURNING * INTO v_attempt;
  v_result:=private.square_publication_state(v_attempt.id);
  PERFORM private.complete_command_request_for(v_actor,p_request_id,v_result);
  RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.finish_square_publication(p_brewery uuid, p_publication uuid, p_actor uuid, p_error_code text, p_response jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_attempt private.square_publications; v_result jsonb; v_object jsonb; v_maps jsonb; v_source_variation jsonb;
  v_item text; v_variation text; v_item_version bigint; v_variation_version bigint; v_present boolean; v_format uuid; v_sku uuid;
  v_expected_versions jsonb; v_changed_variations jsonb; v_request_variation jsonb; v_response_variation jsonb;
BEGIN
  SELECT * INTO v_attempt FROM private.square_publications WHERE id=p_publication AND brewery_id=p_brewery;
  IF NOT FOUND OR NOT private.actor_has_staff_roles(p_brewery, p_actor, ARRAY['admin','warehouse']::public.staff_role[]) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'square-publish:'||v_attempt.connection_id::text||':'||v_attempt.brand_id::text||':'||v_attempt.catalog_group,0));
  PERFORM private.supersede_square_publications(v_attempt.connection_id);
  SELECT * INTO v_attempt FROM private.square_publications WHERE id=p_publication FOR UPDATE;
  IF v_attempt.status IN ('succeeded','rejected','superseded') THEN RETURN v_attempt.result; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pos_connections c JOIN private.integration_tokens t
    ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
    WHERE c.id=v_attempt.connection_id AND c.brewery_id=p_brewery AND c.state='connected'
      AND c.credential_version=v_attempt.credential_version AND c.catalog_sync_generation=v_attempt.catalog_generation
      AND t.credential_version=v_attempt.credential_version)
  THEN RAISE EXCEPTION 'Square publication was superseded' USING errcode='MG409'; END IF;
  IF p_error_code IS NOT NULL THEN
    IF p_error_code NOT IN ('version_mismatch','provider_rejected','provider_missing','provider_invalid') OR p_response IS NOT NULL
      OR (v_attempt.status='needs_snapshot' AND p_error_code NOT IN ('provider_missing','provider_invalid'))
    THEN RAISE EXCEPTION 'Square publication result is invalid'; END IF;
    v_result:=jsonb_build_object('published',false,'conflict',p_error_code='version_mismatch','errorCode',p_error_code);
    UPDATE private.square_publications SET status='rejected',error_code=p_error_code,result=v_result,finished_at=now() WHERE id=v_attempt.id;
    PERFORM private.complete_command_request_for(v_attempt.actor_id,v_attempt.request_id,private.square_publication_state(v_attempt.id));
    RETURN v_result;
  END IF;
  IF v_attempt.status<>'prepared' THEN RAISE EXCEPTION 'Square publication was not prepared' USING errcode='MG409'; END IF;
  v_object:=p_response->'catalogObject'; v_maps:=p_response->'idMappings';
  v_expected_versions:=v_attempt.expected_variation_versions->'versions';
  v_changed_variations:=v_attempt.expected_variation_versions->'changed';
  IF jsonb_typeof(v_object)<>'object' OR jsonb_typeof(v_maps)<>'array' THEN RAISE EXCEPTION 'Square publication response is invalid'; END IF;
  IF v_attempt.external_item_id IS NULL THEN
    SELECT e->>'object_id' INTO v_item FROM jsonb_array_elements(v_maps) e
      WHERE e->>'client_object_id'=(v_attempt.request_body::jsonb#>>'{object,id}');
  ELSE v_item:=v_attempt.external_item_id; END IF;
  IF v_object->>'type'='ITEM' THEN
    IF v_object->>'id'<>v_item THEN RAISE EXCEPTION 'Square publication response identity is invalid'; END IF;
    v_item_version:=(v_object->>'version')::bigint;
    IF v_attempt.expected_item_version IS NOT NULL AND v_item_version<=v_attempt.expected_item_version
      THEN RAISE EXCEPTION 'Square publication response version is invalid'; END IF;
  ELSIF v_object->>'type'='ITEM_VARIATION' THEN
    IF v_object#>>'{item_variation_data,item_id}'<>v_item THEN RAISE EXCEPTION 'Square publication response identity is invalid'; END IF;
    v_item_version:=v_attempt.expected_item_version;
  ELSE RAISE EXCEPTION 'Square publication response type is invalid'; END IF;
  IF nullif(btrim(v_item),'') IS NULL OR v_item_version IS NULL OR v_item_version<0
    THEN RAISE EXCEPTION 'Square publication response is invalid'; END IF;
  v_present:=EXISTS(SELECT 1 FROM jsonb_array_elements(v_attempt.source_snapshot->'variations') e
    WHERE coalesce((e->>'present')::boolean,false));
  INSERT INTO public.pos_catalog_items(brewery_id,connection_id,brand_id,catalog_group,external_item_id,ownership,retired_at)
  VALUES(p_brewery,v_attempt.connection_id,v_attempt.brand_id,v_attempt.catalog_group,v_item,v_attempt.ownership_intent,
    CASE WHEN v_present THEN null ELSE now() END)
  ON CONFLICT(connection_id,brand_id,catalog_group) DO UPDATE SET external_item_id=excluded.external_item_id,
    ownership=excluded.ownership,retired_at=excluded.retired_at,updated_at=now();
  FOR v_source_variation IN SELECT value FROM jsonb_array_elements(v_attempt.source_snapshot->'variations')
  LOOP
    v_format:=(v_source_variation->>'formatId')::uuid;
    v_sku:=(v_source_variation->>'skuId')::uuid;
    v_variation:=v_source_variation->>'externalVariationId';
    IF v_variation IS NULL AND coalesce((v_source_variation->>'present')::boolean,false) THEN
      SELECT e->>'object_id' INTO v_variation FROM jsonb_array_elements(v_maps) e
        WHERE e->>'client_object_id'='#mgr-variation-'||(v_source_variation->>'formatId');
    END IF;
    IF v_variation IS NULL THEN CONTINUE; END IF;
    IF v_object->>'type'='ITEM' THEN
      SELECT e,(e->>'version')::bigint INTO v_response_variation,v_variation_version
        FROM jsonb_array_elements(v_object#>'{item_data,variations}') e
        WHERE e->>'id'=v_variation;
      SELECT e INTO v_request_variation FROM jsonb_array_elements(v_attempt.request_body::jsonb#>'{object,item_data,variations}') e
        WHERE e->>'id'=v_variation;
    ELSIF v_object->>'id'=v_variation THEN
      v_response_variation:=v_object; v_variation_version:=(v_object->>'version')::bigint;
      v_request_variation:=v_attempt.request_body::jsonb->'object';
    ELSE CONTINUE;
    END IF;
    IF v_variation_version IS NULL OR v_variation_version<0 OR
      ((v_expected_versions ? v_variation) AND
        (v_variation_version<(v_expected_versions->>v_variation)::bigint
          OR (v_changed_variations ? v_variation) AND v_variation_version=(v_expected_versions->>v_variation)::bigint
          OR v_request_variation IS NULL OR NOT (v_response_variation @> (v_request_variation-'version'))))
    THEN RAISE EXCEPTION 'Square publication response version is invalid'; END IF;
    INSERT INTO public.pos_catalog_variations(brewery_id,connection_id,external_item_id,external_variation_id,
      external_item_name,external_variation_name,source_version,available,last_seen_at)
    VALUES(p_brewery,v_attempt.connection_id,v_item,v_variation,v_attempt.source_snapshot->>'brand',
      v_source_variation->>'format',v_variation_version,true,now())
    ON CONFLICT(connection_id,external_item_id,external_variation_id) DO UPDATE SET
      external_item_name=excluded.external_item_name,external_variation_name=excluded.external_variation_name,
      source_version=excluded.source_version,available=true,last_seen_at=excluded.last_seen_at;
    INSERT INTO public.pos_item_mappings(brewery_id,connection_id,external_item_id,external_item_name,
      external_variation_id,format_id,sku_id,ignored)
    VALUES(p_brewery,v_attempt.connection_id,v_item,v_attempt.source_snapshot->>'brand',v_variation,
      CASE WHEN v_sku IS NULL THEN v_format END,v_sku,false)
    ON CONFLICT(connection_id,external_item_id,external_variation_id) DO UPDATE SET
      external_item_name=excluded.external_item_name,format_id=excluded.format_id,sku_id=excluded.sku_id,ignored=false;
    INSERT INTO public.pos_catalog_ownership(brewery_id,connection_id,brand_id,catalog_group,format_id,
      external_item_id,external_variation_id,retired_at)
    VALUES(p_brewery,v_attempt.connection_id,v_attempt.brand_id,v_attempt.catalog_group,v_format,v_item,v_variation,
      CASE WHEN coalesce((v_source_variation->>'present')::boolean,false) THEN null ELSE now() END)
    ON CONFLICT(connection_id,format_id,brand_id) DO UPDATE SET external_item_id=excluded.external_item_id,
      external_variation_id=excluded.external_variation_id,retired_at=excluded.retired_at,updated_at=now();
    INSERT INTO private.square_publication_events(publication_id,brewery_id,connection_id,brand_id,catalog_group,
      format_id,external_item_id,external_variation_id,ownership,present)
    VALUES(v_attempt.id,p_brewery,v_attempt.connection_id,v_attempt.brand_id,v_attempt.catalog_group,v_format,
      v_item,v_variation,v_attempt.ownership_intent,coalesce((v_source_variation->>'present')::boolean,false));
  END LOOP;
  v_result:=jsonb_build_object('published',v_present,'retired',NOT v_present,'externalItemId',v_item,
    'ownership',v_attempt.ownership_intent,'variations',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'formatId',o.format_id,'externalVariationId',o.external_variation_id,'retired',o.retired_at IS NOT NULL)
      ORDER BY o.format_id),'[]'::jsonb) FROM public.pos_catalog_ownership o WHERE o.connection_id=v_attempt.connection_id
        AND o.brand_id=v_attempt.brand_id AND o.catalog_group=v_attempt.catalog_group));
  UPDATE private.square_publications SET status='succeeded',result=v_result,finished_at=now() WHERE id=v_attempt.id;
  PERFORM private.complete_command_request_for(v_attempt.actor_id,v_attempt.request_id,private.square_publication_state(v_attempt.id));
  RETURN v_result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR no_data_found THEN
  RAISE EXCEPTION 'Square publication response is invalid';
END $function$;
