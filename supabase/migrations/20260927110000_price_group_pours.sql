-- Pours belong to a price group, not a brand. Every beer on the group shares
-- that group's pours; the price grid column is the pour's name. What one beer
-- does with a shared pour stays keyed by beer + pour: its menu line, its
-- Square variation (pos_catalog_ownership) and its sales (pos_sale_expectations
-- already carry brand_id).

alter table public.formats add column if not exists price_group_id uuid;

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.formats'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%brand_id%'
  loop
    execute format('alter table public.formats drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.pos_menu_lines add column if not exists brand_id uuid;
alter table public.pos_menu_lines drop constraint if exists pos_menu_lines_pkey;
alter table public.pos_catalog_ownership drop constraint if exists pos_catalog_ownership_pkey;

-- backfill:begin — tests/shared-pours.test.ts replays this section against legacy rows.

-- A menu line belonged to its pour's beer.
update public.pos_menu_lines l set brand_id = f.brand_id
  from public.formats f
 where f.id = l.format_id and f.basis = 'poured' and l.brand_id is null;

-- A beer with pours but no price group gets a group of its own, named after
-- the beer (plus its id when that name is taken), so none of its pours is lost.
do $$
declare r record; v_group uuid;
begin
  for r in
    select distinct b.id, b.brewery_id, b.name from public.brands b
      join public.formats f on f.brand_id = b.id and f.basis = 'poured'
     where b.price_group_id is null
     order by b.brewery_id, b.name, b.id
  loop
    insert into public.price_groups (brewery_id, name, position)
    values (r.brewery_id,
      case when exists (select 1 from public.price_groups g where g.brewery_id = r.brewery_id and g.name = r.name)
        then r.name || ' (' || left(r.id::text, 8) || ')' else r.name end,
      (select coalesce(max(g.position), 0) + 1 from public.price_groups g where g.brewery_id = r.brewery_id))
    returning id into v_group;
    update public.brands set price_group_id = v_group where id = r.id;
  end loop;
end $$;

update public.formats f
   set price_group_id = b.price_group_id
  from public.brands b
 where f.basis = 'poured' and f.brand_id = b.id and f.price_group_id is null;

-- A pour served only its own beer, whose group is now the pour's group, so a
-- price cell on any other group was never read. Dropping it loses nothing.
delete from public.channel_prices cp
 using public.formats f
 where f.id = cp.format_id and f.basis = 'poured' and cp.price_group_id is distinct from f.price_group_id;

-- Same-named pours on one group become one: the oldest survives (rank 1) and
-- every reference to a later one (rank > 1) moves to it.
create temporary table pour_merge as
  select id as pour, first_value(id) over w as survivor, row_number() over w as rank
    from public.formats where basis = 'poured'
  window w as (partition by brewery_id, price_group_id, btrim(name) order by created_at, id);

-- Price cells collide on (channel, group, pour): the lowest-ranked pour's
-- price wins, so the survivor's own price beats a merged one.
delete from public.channel_prices cp
 using pour_merge m
 where cp.format_id = m.pour and exists (
   select 1 from public.channel_prices k join pour_merge km on km.pour = k.format_id
    where km.survivor = m.survivor and km.rank < m.rank
      and k.sale_channel_id = cp.sale_channel_id and k.price_group_id = cp.price_group_id);

-- The rest cannot collide: menu lines and Square ownership are keyed by beer,
-- and every merged pour came from a different beer (a beer's pour names were
-- unique). Poured formats are never used by SKUs, BOMs or components
-- (guard_format_basis), so those need no repoint; one would stop the delete.
update public.channel_prices t set format_id = m.survivor from pour_merge m where t.format_id = m.pour and m.rank > 1;
update public.pos_menu_lines t set format_id = m.survivor from pour_merge m where t.format_id = m.pour and m.rank > 1;
update public.pos_item_mappings t set format_id = m.survivor from pour_merge m where t.format_id = m.pour and m.rank > 1;
update public.pos_catalog_ownership t set format_id = m.survivor from pour_merge m where t.format_id = m.pour and m.rank > 1;
update public.pos_sale_expectations t set format_id = m.survivor from pour_merge m where t.format_id = m.pour and m.rank > 1;
update private.square_publication_events t set format_id = m.survivor from pour_merge m where t.format_id = m.pour and m.rank > 1;
delete from public.formats f using pour_merge m where f.id = m.pour and m.rank > 1;
drop table pour_merge;

update public.formats set brand_id = null where basis = 'poured';

-- backfill:end

alter table public.formats
  add constraint formats_poured_group_chk check (
    (basis = 'poured' and price_group_id is not null and ounces is not null
     and ounces > 0 and ounces < 1000 and brand_id is null)
    or (basis = 'packaged' and price_group_id is null and ounces is null and brand_id is null));

alter table public.formats
  add constraint formats_price_group_fk
  foreign key (price_group_id, brewery_id) references public.price_groups (id, brewery_id);

drop index if exists public.formats_poured_name_idx;
create unique index formats_poured_name_idx on public.formats (brewery_id, price_group_id, btrim(name)) where basis = 'poured';

alter table public.pos_menu_lines
  alter column brand_id set not null,
  add constraint pos_menu_lines_pkey primary key (menu_id, format_id, brand_id),
  add constraint pos_menu_lines_brand_fk foreign key (brand_id, brewery_id) references public.brands (id, brewery_id);
alter table public.pos_catalog_ownership
  add constraint pos_catalog_ownership_pkey primary key (connection_id, format_id, brand_id);

-- Test and import inserts may still name a brand; the pour belongs to that brand's group.
create function private.formats_pour_owner() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.basis = 'poured' and new.price_group_id is null and new.brand_id is not null then
    select price_group_id into new.price_group_id from public.brands where id = new.brand_id;
    new.brand_id := null;
  end if;
  return new;
end $$;
create trigger formats_pour_owner before insert or update of brand_id, price_group_id, basis on public.formats
  for each row execute function private.formats_pour_owner();

drop function if exists public.upsert_format(uuid, uuid, text, public.format_basis, public.package_type, public.keg_size, int, numeric, uuid, uuid, numeric);

create or replace function public.upsert_format(
  p_brewery uuid, p_id uuid, p_name text, p_basis public.format_basis, p_package_type public.package_type,
  p_keg_size public.keg_size, p_units_per_case int, p_bbl_per_unit numeric, p_request_id uuid,
  p_price_group uuid default null, p_ounces numeric default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.formats;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_format', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'basis', p_basis, 'package_type', p_package_type,
                       'keg_size', p_keg_size, 'units_per_case', p_units_per_case, 'bbl_per_unit', p_bbl_per_unit)
      || case when p_basis = 'poured' or p_price_group is not null or p_ounces is not null
           then jsonb_build_object('price_group', p_price_group, 'ounces', p_ounces) else '{}'::jsonb end);
  if v_replay is not null then return v_replay; end if;
  if p_id is null then
    insert into public.formats (brewery_id, name, basis, package_type, keg_size, units_per_case, bbl_per_unit, ounces, price_group_id)
    values (p_brewery, p_name, p_basis, p_package_type, p_keg_size, p_units_per_case, p_bbl_per_unit, p_ounces, p_price_group) returning * into v_row;
  else
    select * into v_row from public.formats where id = p_id and brewery_id = p_brewery for update;
    if v_row.id is null then raise exception 'format not found'; end if;
    -- A pour's prices, menu lines and Square variations are filed under its group.
    if v_row.basis = 'poured' and p_basis = 'poured' and v_row.price_group_id is distinct from p_price_group then
      raise exception 'a pour cannot move to another price group';
    end if;
    -- #632's in-use volume lock (20260927100000), kept through this redefinition.
    if v_row.basis = p_basis
       and (v_row.bbl_per_unit, v_row.units_per_case, v_row.ounces) is distinct from (p_bbl_per_unit, p_units_per_case, p_ounces)
       and (private.format_used_as_packaged(p_id) or private.format_used_as_poured(p_id)) then
      raise exception 'format is in use: its bbl per unit, units per case and ounces cannot change';
    end if;
    update public.formats set name = p_name, basis = p_basis, package_type = p_package_type, keg_size = p_keg_size,
      units_per_case = p_units_per_case, bbl_per_unit = p_bbl_per_unit, ounces = p_ounces, price_group_id = p_price_group
    where id = p_id returning * into v_row;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.upsert_format(uuid, uuid, text, public.format_basis, public.package_type, public.keg_size, int, numeric, uuid, uuid, numeric) from public, anon, authenticated, service_role;
grant execute on function public.upsert_format(uuid, uuid, text, public.format_basis, public.package_type, public.keg_size, int, numeric, uuid, uuid, numeric) to authenticated;

create or replace function public.delete_format(p_brewery uuid, p_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_format public.formats;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'delete_format', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id));
  if v_replay is not null then return v_replay; end if;
  select * into v_format from public.formats where id = p_id and brewery_id = p_brewery for update;
  if not found then raise exception 'format not found'; end if;
  if v_format.basis = 'packaged' then
    perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  end if;
  begin
    delete from public.format_components where parent_format_id = p_id and brewery_id = p_brewery;
    delete from public.format_bom where format_id = p_id and brewery_id = p_brewery;
    delete from public.formats where id = p_id and brewery_id = p_brewery;
  exception when foreign_key_violation then
    raise exception 'Format is in use by a SKU, another package, pricing or history and cannot be deleted.' using errcode = 'MG409';
  end;
  return private.complete_command_request(p_request_id, jsonb_build_object('id', p_id));
end $$;

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

CREATE OR REPLACE FUNCTION private.reconcile_pos_sale (
  p_brewery uuid,
  p_sale    uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
DECLARE s public.pos_sales; m public.pos_item_mappings; f public.formats; v_location uuid; v_brand uuid; v_ounces numeric; v_format uuid;
BEGIN
  SELECT * INTO s FROM public.pos_sales WHERE id=p_sale AND brewery_id=p_brewery FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sale not found'; END IF;
  IF s.fact_status<>'accepted' OR s.qty IS NULL THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM public.pos_sale_expectations WHERE sale_id=p_sale AND brewery_id=p_brewery) THEN RETURN true; END IF;
  SELECT location_id INTO v_location FROM public.pos_locations WHERE connection_id=s.connection_id
    AND external_location_id=s.external_location_id AND brewery_id=p_brewery FOR SHARE;
  IF v_location IS NULL THEN RETURN false; END IF;
  SELECT * INTO m FROM public.pos_item_mappings WHERE connection_id=s.connection_id
    AND external_item_id=coalesce(s.external_item_id,(SELECT c.external_item_id FROM public.pos_catalog_variations c
      WHERE c.connection_id=s.connection_id AND c.external_variation_id=s.external_variation_id))
    AND external_variation_id=s.external_variation_id AND brewery_id=p_brewery FOR SHARE;
  IF NOT FOUND OR m.ignored THEN RETURN false; END IF;
  IF m.format_id IS NOT NULL THEN
    SELECT * INTO f FROM public.formats WHERE id=m.format_id AND brewery_id=p_brewery FOR SHARE;
    IF f.basis<>'poured' THEN RAISE EXCEPTION 'map a poured format'; END IF;
    -- A shared pour names no beer, so the beer comes from MGR's own Square item,
    -- else the group's only beer, else the one beer on the group on tap here
    -- when the sale was made.
    SELECT i.brand_id INTO v_brand FROM public.pos_catalog_items i
      WHERE i.connection_id=s.connection_id AND i.external_item_id=m.external_item_id AND i.brewery_id=p_brewery;
    IF v_brand IS NULL THEN
      SELECT min(b.id::text)::uuid INTO v_brand FROM public.brands b
        WHERE b.price_group_id=f.price_group_id AND b.brewery_id=p_brewery HAVING count(*)=1;
    END IF;
    IF v_brand IS NULL THEN
      SELECT min(k.brand_id::text)::uuid INTO v_brand FROM public.tap_intervals t
        JOIN public.skus k ON k.id=t.sku_id AND k.brewery_id=t.brewery_id
        JOIN public.brands b ON b.id=k.brand_id AND b.brewery_id=k.brewery_id AND b.price_group_id=f.price_group_id
        WHERE t.brewery_id=p_brewery AND t.location_id=v_location
          AND t.opened_at<=s.sold_at AND (t.closed_at IS NULL OR t.closed_at>s.sold_at)
        HAVING count(DISTINCT k.brand_id)=1;
    END IF;
    -- None or several on tap: leave it unreconciled, like an unmapped sale.
    IF v_brand IS NULL THEN RETURN false; END IF;
    v_format:=f.id; v_ounces:=f.ounces;
  ELSE
    SELECT brand_id,format_id INTO v_brand,v_format FROM public.skus WHERE id=m.sku_id AND brewery_id=p_brewery FOR SHARE;
    PERFORM 1 FROM public.formats WHERE id=v_format AND brewery_id=p_brewery FOR SHARE;
    PERFORM 1 FROM public.format_components c JOIN public.formats child ON child.id=c.child_format_id AND child.brewery_id=c.brewery_id
      WHERE c.parent_format_id=v_format AND c.brewery_id=p_brewery ORDER BY child.id FOR SHARE OF child;
    SELECT bbl_per_unit*3968 INTO v_ounces FROM public.format_volumes WHERE id=v_format AND brewery_id=p_brewery;
  END IF;
  IF v_ounces IS NULL OR v_ounces<=0 OR v_ounces::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'serving volume is unavailable'; END IF;
  INSERT INTO public.pos_sale_expectations(sale_id,brewery_id,location_id,brand_id,format_id,sku_id,serving_ounces,expected_bbl)
  VALUES(p_sale,p_brewery,v_location,v_brand,v_format,m.sku_id,v_ounces,
    CASE s.fact_kind WHEN 'return' THEN -1 ELSE 1 END*s.qty*v_ounces/3968);
  RETURN true;
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
  v_menu_attempt private.square_menu_publications; v_manifest_entry jsonb;
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
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('square-publish:'||v_connection.id::text||':'||p_brand::text||':poured',0));
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
    AND p.brand_id=p_brand AND p.catalog_group='poured' AND p.status IN ('needs_snapshot','prepared') FOR UPDATE;
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
    AND p.brand_id=p_brand AND p.catalog_group='poured' ORDER BY p.created_at DESC,p.id DESC LIMIT 1;
  IF v_previous.status='rejected' AND v_previous.error_code='version_mismatch' AND NOT p_retry_conflict THEN
    RAISE EXCEPTION 'Square changed this item; retry requires current version confirmation' USING errcode='MG409'; END IF;
  INSERT INTO private.square_publications(brewery_id,connection_id,actor_id,menu_publication_id,request_id,command_name,
    credential_version,catalog_generation,external_location_id,brand_id,catalog_group,ownership_intent,
    external_item_id,adopt_variation_id,source_snapshot)
  VALUES(p_brewery,v_connection.id,v_actor,p_menu_publication,p_request_id,p_command,v_connection.credential_version,
    v_connection.catalog_sync_generation,p_external_location,p_brand,'poured',v_ownership,v_external_item,p_adopt_variation,
    CASE WHEN p_menu_publication IS NULL THEN jsonb_build_object('brandId',p_brand,'brand',v_brand_name,
      'catalogGroup','poured','locationId',p_external_location,'ownership',v_ownership,
      'externalItemId',v_external_item,'variations',v_variations) ELSE v_snapshot END) RETURNING * INTO v_attempt;
  v_result:=private.square_publication_state(v_attempt.id);
  PERFORM private.complete_command_request_for(v_actor,p_request_id,v_result);
  RETURN v_result;
END $function$;


CREATE OR REPLACE FUNCTION public.get_published_pos_menu (
  p_public_id uuid
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
    JOIN public.pos_locations pl ON pl.connection_id=m.connection_id AND pl.external_location_id=m.external_location_id
      AND pl.brewery_id=m.brewery_id AND pl.location_id=m.location_id AND pl.available
    WHERE m.public_id=p_public_id
  ),
  published AS (
    SELECT b.name brand,f.name format,f.ounces,coalesce(l.price_override_cents,cp.unit_price_cents) price_cents
    FROM menu m JOIN public.pos_menu_lines l ON l.menu_id=m.id AND l.brewery_id=m.brewery_id AND l.website_published_at IS NOT NULL
    JOIN public.formats f ON f.id=l.format_id AND f.brewery_id=l.brewery_id AND f.basis='poured'
    JOIN public.brands b ON b.id=l.brand_id AND b.price_group_id=f.price_group_id AND b.brewery_id=f.brewery_id
    LEFT JOIN public.channel_prices cp ON cp.brewery_id=m.brewery_id AND cp.sale_channel_id=m.sale_channel_id
      AND cp.price_group_id=f.price_group_id AND cp.format_id=f.id
    WHERE coalesce(l.price_override_cents,cp.unit_price_cents) IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.skus s JOIN public.formats sf ON sf.id=s.format_id AND sf.brewery_id=s.brewery_id
      JOIN public.inventory_movements im ON im.sku_id=s.id AND im.brewery_id=s.brewery_id
        AND im.location_id=m.location_id AND im.bin_id=m.bin_id
      WHERE s.brewery_id=m.brewery_id AND s.brand_id=b.id AND s.active
        AND sf.basis='packaged' AND sf.package_type='keg'
      GROUP BY s.id HAVING sum(im.qty)>0)
  )
  SELECT jsonb_build_object('location',loc.name,
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object('brand',p.brand,'format',p.format,'ounces',p.ounces,
      'priceCents',p.price_cents,'available',true) ORDER BY p.brand,p.format) FROM published p),'[]'::jsonb))
  FROM menu m JOIN public.locations loc ON loc.id=m.location_id AND loc.brewery_id=m.brewery_id;
$function$;

CREATE OR REPLACE FUNCTION public.lease_square_publication (
  p_brewery     uuid,
  p_publication uuid,
  p_actor       uuid
)
  RETURNS TABLE (
    access_token       text,
    request_body       text,
    superseded         boolean,
    refresh_token      text,
    access_expires_at  timestamp with time zone,
    merchant_id        text,
    credential_version bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE v_attempt private.square_publications;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor
    AND u.role IN ('admin','warehouse')) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  SELECT * INTO v_attempt FROM private.square_publications p WHERE p.id=p_publication AND p.brewery_id=p_brewery;
  IF NOT FOUND THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  PERFORM private.supersede_square_publications(v_attempt.connection_id);
  SELECT p.* INTO v_attempt FROM private.square_publications p WHERE p.id=p_publication FOR UPDATE;
  IF v_attempt.status='superseded' THEN
    RETURN QUERY SELECT null::text,null::text,true,null::text,null::timestamptz,null::text,null::bigint;
    RETURN;
  END IF;
  RETURN QUERY SELECT t.access_token,p.request_body,false,t.refresh_token,c.access_expires_at,c.merchant_id,c.credential_version
  FROM private.square_publications p
  JOIN public.pos_connections c ON c.id=p.connection_id AND c.brewery_id=p.brewery_id AND c.provider='square'
    AND c.state='connected' AND c.credential_version=p.credential_version AND c.catalog_sync_generation=p.catalog_generation
  JOIN private.integration_tokens t ON t.brewery_id=p.brewery_id AND t.provider='square'
    AND t.connection_id=p.connection_id AND t.credential_version=p.credential_version
  WHERE p.id=p_publication AND p.status IN ('needs_snapshot','prepared') AND (
    (p.external_item_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.pos_catalog_items i
      WHERE i.connection_id=p.connection_id AND i.brand_id=p.brand_id AND i.catalog_group=p.catalog_group))
    OR EXISTS(SELECT 1 FROM public.pos_catalog_items i WHERE i.connection_id=p.connection_id AND i.brand_id=p.brand_id
      AND i.catalog_group=p.catalog_group AND i.external_item_id=p.external_item_id AND i.ownership=p.ownership_intent)
    OR (p.ownership_intent='adopted' AND p.adopt_variation_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.pos_catalog_variations v JOIN public.pos_item_mappings m
        ON m.connection_id=v.connection_id AND m.external_item_id=v.external_item_id
          AND m.external_variation_id=v.external_variation_id AND NOT m.ignored
      JOIN public.formats f ON f.id=m.format_id AND f.brewery_id=m.brewery_id AND f.price_group_id=(SELECT price_group_id FROM public.brands WHERE id=p.brand_id AND brewery_id=p.brewery_id)
      WHERE v.connection_id=p.connection_id AND v.external_item_id=p.external_item_id
        AND v.external_variation_id=p.adopt_variation_id AND v.available)));
END $function$;

-- A menu line is one beer's pour, so the three menu-line RPCs take the beer too.
DROP FUNCTION public.set_pos_website_publication(uuid,text,uuid,boolean,uuid);
DROP FUNCTION public.set_pos_price_override(uuid,text,uuid,integer,uuid);
DROP FUNCTION public.get_pos_menu_item(uuid,text,uuid);

CREATE FUNCTION public.set_pos_website_publication (
  p_brewery           uuid,
  p_external_location text,
  p_format            uuid,
  p_brand             uuid,
  p_published         boolean,
  p_request_id        uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE v_actor uuid; v_replay jsonb; v_menu public.pos_menus; v_result jsonb; v_price integer;
BEGIN
  v_actor:=private.assert_staff(p_brewery,ARRAY['admin','warehouse']::public.staff_role[]);
  v_replay:=private.claim_command_request_for(v_actor,p_brewery,'set_pos_website_publication',p_request_id,
    jsonb_build_object('posLocationId',p_external_location,'formatId',p_format,'brandId',p_brand,'published',p_published));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT m.* INTO v_menu FROM public.pos_menus m JOIN public.pos_locations pl ON pl.connection_id=m.connection_id
    AND pl.external_location_id=m.external_location_id AND pl.location_id=m.location_id AND pl.brewery_id=m.brewery_id
    JOIN public.pos_connections c ON c.id=m.connection_id AND c.brewery_id=m.brewery_id AND c.state='connected'
    WHERE m.brewery_id=p_brewery AND m.external_location_id=p_external_location FOR UPDATE OF m;
  IF NOT FOUND OR NOT private.pours_for_brand(p_brewery,p_format,p_brand)
  THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  SELECT coalesce(l.price_override_cents,cp.unit_price_cents) INTO v_price
    FROM public.formats f
    LEFT JOIN public.pos_menu_lines l ON l.menu_id=v_menu.id AND l.format_id=f.id AND l.brand_id=p_brand
    LEFT JOIN public.channel_prices cp ON cp.brewery_id=f.brewery_id AND cp.sale_channel_id=v_menu.sale_channel_id
      AND cp.price_group_id=f.price_group_id AND cp.format_id=f.id
    WHERE f.id=p_format AND f.brewery_id=p_brewery;
  IF p_published AND (v_price IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.skus s JOIN public.formats sf ON sf.id=s.format_id AND sf.brewery_id=s.brewery_id
    JOIN public.inventory_movements im ON im.sku_id=s.id AND im.brewery_id=s.brewery_id
      AND im.location_id=v_menu.location_id AND im.bin_id=v_menu.bin_id
    WHERE s.brewery_id=p_brewery AND s.brand_id=p_brand
      AND s.active AND sf.basis='packaged' AND sf.package_type='keg'
    GROUP BY s.id HAVING sum(im.qty)>0))
  THEN RAISE EXCEPTION 'Only a priced format with stock in the selected bin can publish'; END IF;
  INSERT INTO public.pos_menu_lines(menu_id,brewery_id,format_id,brand_id,website_published_at)
    VALUES(v_menu.id,p_brewery,p_format,p_brand,CASE WHEN p_published THEN now() END)
    ON CONFLICT(menu_id,format_id,brand_id) DO UPDATE SET website_published_at=excluded.website_published_at,updated_at=now();
  DELETE FROM public.pos_menu_lines WHERE menu_id=v_menu.id AND format_id=p_format AND brand_id=p_brand
    AND price_override_cents IS NULL AND website_published_at IS NULL;
  v_result:=jsonb_build_object('saved',true,'published',p_published);
  RETURN private.complete_command_request_for(v_actor,p_request_id,v_result);
END $function$;
REVOKE ALL ON FUNCTION public.set_pos_website_publication(uuid,text,uuid,uuid,boolean,uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_pos_website_publication(uuid,text,uuid,uuid,boolean,uuid) TO authenticated;

CREATE FUNCTION public.set_pos_price_override (
  p_brewery           uuid,
  p_external_location text,
  p_format            uuid,
  p_brand             uuid,
  p_unit_price_cents  integer,
  p_request_id        uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE v_actor uuid; v_replay jsonb; v_menu public.pos_menus; v_result jsonb;
BEGIN
  v_actor:=private.assert_staff(p_brewery,ARRAY['admin','warehouse']::public.staff_role[]);
  v_replay:=private.claim_command_request_for(v_actor,p_brewery,'set_pos_price_override',p_request_id,
    jsonb_build_object('posLocationId',p_external_location,'formatId',p_format,'brandId',p_brand,'unitPriceCents',p_unit_price_cents));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF p_unit_price_cents<0 THEN RAISE EXCEPTION 'price must be zero or more'; END IF;
  SELECT m.* INTO v_menu FROM public.pos_menus m JOIN public.pos_locations pl ON pl.connection_id=m.connection_id
    AND pl.external_location_id=m.external_location_id AND pl.location_id=m.location_id AND pl.brewery_id=m.brewery_id
    JOIN public.pos_connections c ON c.id=m.connection_id AND c.brewery_id=m.brewery_id AND c.state='connected'
    WHERE m.brewery_id=p_brewery AND m.external_location_id=p_external_location FOR UPDATE OF m;
  IF NOT FOUND OR NOT private.pours_for_brand(p_brewery,p_format,p_brand)
  THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  INSERT INTO public.pos_menu_lines(menu_id,brewery_id,format_id,brand_id,price_override_cents)
    VALUES(v_menu.id,p_brewery,p_format,p_brand,p_unit_price_cents)
    ON CONFLICT(menu_id,format_id,brand_id) DO UPDATE SET price_override_cents=excluded.price_override_cents,updated_at=now();
  DELETE FROM public.pos_menu_lines WHERE menu_id=v_menu.id AND format_id=p_format AND brand_id=p_brand
    AND price_override_cents IS NULL AND website_published_at IS NULL;
  v_result:=jsonb_build_object('saved',true,'unitPriceCents',p_unit_price_cents);
  RETURN private.complete_command_request_for(v_actor,p_request_id,v_result);
END $function$;
REVOKE ALL ON FUNCTION public.set_pos_price_override(uuid,text,uuid,uuid,integer,uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_pos_price_override(uuid,text,uuid,uuid,integer,uuid) TO authenticated;

CREATE FUNCTION public.get_pos_menu_item (
  p_brewery           uuid,
  p_external_location text,
  p_format            uuid,
  p_brand             uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE v_snapshot jsonb; v_item jsonb;
BEGIN
  v_snapshot:=public.get_pos_menu(p_brewery,p_external_location);
  SELECT value INTO v_item FROM jsonb_array_elements((v_snapshot->'items')||(v_snapshot->'excluded'))
    WHERE value->>'formatId'=p_format::text AND value->>'brandId'=p_brand::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'Menu item not found'; END IF;
  RETURN v_item;
END $function$;
REVOKE ALL ON FUNCTION public.get_pos_menu_item(uuid,text,uuid,uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pos_menu_item(uuid,text,uuid,uuid) TO authenticated;

-- A beer pours a format when the format is a pour on the beer's price group.
CREATE FUNCTION private.pours_for_brand (p_brewery uuid, p_format uuid, p_brand uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  SELECT EXISTS(SELECT 1 FROM public.formats f JOIN public.brands b ON b.price_group_id=f.price_group_id AND b.brewery_id=f.brewery_id
    WHERE f.id=p_format AND b.id=p_brand AND f.brewery_id=p_brewery AND f.basis='poured')
$function$;

CREATE OR REPLACE FUNCTION public.set_pos_item_mapping (
  p_brewery            uuid,
  p_external_item      text,
  p_external_variation text,
  p_sku                uuid,
  p_format             uuid,
  p_ignored            boolean,
  p_request_id         uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE c uuid; replay jsonb; result jsonb; item_name text;
BEGIN
  PERFORM private.assert_staff(p_brewery,ARRAY['admin','warehouse']::public.staff_role[]);
  replay:=private.claim_command_request(p_brewery,'set_pos_item_mapping',p_request_id,jsonb_build_object('externalItemId',p_external_item,'externalVariationId',p_external_variation,'skuId',p_sku,'formatId',p_format,'ignored',p_ignored));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF (p_ignored AND num_nonnulls(p_sku,p_format)<>0) OR (NOT p_ignored AND num_nonnulls(p_sku,p_format)<>1) THEN RAISE EXCEPTION 'mapping target invalid'; END IF;
  SELECT id INTO c FROM public.pos_connections WHERE brewery_id=p_brewery AND provider='square' AND state='connected' FOR UPDATE;
  SELECT external_item_name INTO item_name FROM public.pos_catalog_variations WHERE brewery_id=p_brewery AND connection_id=c
    AND external_item_id=p_external_item AND external_variation_id=p_external_variation AND (available OR EXISTS(
      SELECT 1 FROM public.pos_item_mappings m WHERE m.connection_id=c AND m.external_item_id=p_external_item AND m.external_variation_id=p_external_variation)
      OR EXISTS(SELECT 1 FROM public.pos_sales s WHERE s.connection_id=c AND s.external_variation_id=p_external_variation)) FOR SHARE;
  IF c IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'Square variation is unavailable'; END IF;
  IF p_sku IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.skus WHERE id=p_sku AND brewery_id=p_brewery) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  IF p_format IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.formats WHERE id=p_format AND brewery_id=p_brewery AND basis='poured' AND price_group_id IS NOT NULL) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  INSERT INTO public.pos_item_mappings(brewery_id,connection_id,external_item_id,external_variation_id,external_item_name,sku_id,format_id,ignored)
    VALUES(p_brewery,c,p_external_item,p_external_variation,item_name,p_sku,p_format,p_ignored)
  ON CONFLICT(connection_id,external_item_id,external_variation_id) DO UPDATE SET external_item_name=excluded.external_item_name,
    sku_id=excluded.sku_id,format_id=excluded.format_id,ignored=excluded.ignored;
  PERFORM private.reconcile_pos_sale(p_brewery,s.id) FROM public.pos_sales s LEFT JOIN public.pos_sale_expectations e ON e.sale_id=s.id
    WHERE s.connection_id=c AND s.external_variation_id=p_external_variation
      AND (s.external_item_id=p_external_item OR s.external_item_id IS NULL) AND e.sale_id IS NULL;
  result:=jsonb_build_object('mapped',NOT p_ignored,'ignored',p_ignored);
  RETURN private.complete_command_request(p_request_id,result);
END $function$;

-- Square ownership is one row per beer + pour, so a second beer on the group
-- inserts its own row instead of overwriting the first beer's variation.
CREATE OR REPLACE FUNCTION public.finish_square_publication(p_brewery uuid, p_publication uuid, p_actor uuid, p_error_code text, p_response jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_attempt private.square_publications; v_result jsonb; v_object jsonb; v_maps jsonb; v_source_variation jsonb;
  v_item text; v_variation text; v_item_version bigint; v_variation_version bigint; v_present boolean; v_format uuid;
  v_expected_versions jsonb; v_changed_variations jsonb; v_request_variation jsonb; v_response_variation jsonb;
BEGIN
  SELECT * INTO v_attempt FROM private.square_publications WHERE id=p_publication AND brewery_id=p_brewery;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor
    AND u.role IN ('admin','warehouse')) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
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
    VALUES(p_brewery,v_attempt.connection_id,v_item,v_attempt.source_snapshot->>'brand',v_variation,v_format,null,false)
    ON CONFLICT(connection_id,external_item_id,external_variation_id) DO UPDATE SET
      external_item_name=excluded.external_item_name,format_id=excluded.format_id,sku_id=null,ignored=false;
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

-- An owned variation drops out of the menu only when that beer's snapshot
-- row is gone; another beer still pouring the same format does not keep it.
CREATE OR REPLACE FUNCTION private.square_menu_publication_manifest(p_snapshot jsonb, p_connection uuid, p_candidates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_snapshot jsonb:=p_snapshot; v_manifest jsonb:='[]'::jsonb; v_brand uuid; v_brand_name text;
  v_external_item text; v_ownership text; v_variations jsonb;
BEGIN
  FOR v_brand IN
    SELECT value::uuid FROM jsonb_array_elements_text(p_candidates) x(value) ORDER BY value::uuid
  LOOP
    v_external_item:=null; v_ownership:='mgr';
    SELECT i.external_item_id,i.ownership INTO v_external_item,v_ownership
      FROM public.pos_catalog_items i WHERE i.connection_id=p_connection
        AND i.brand_id=v_brand AND i.catalog_group='poured';
    IF NOT FOUND THEN v_external_item:=null; v_ownership:='mgr'; END IF;
    SELECT b.name INTO v_brand_name FROM public.brands b WHERE b.id=v_brand;
    WITH source_rows AS (
      SELECT e->>'formatId' format_id,e->>'format' format_name,
        CASE WHEN e->>'priceCents' IS NULL THEN null ELSE (e->>'priceCents')::integer END price_cents,
        coalesce((e->>'available')::boolean,false) AND e->>'priceCents' IS NOT NULL present
      FROM jsonb_array_elements((v_snapshot->'items')||(v_snapshot->'excluded')) e
      WHERE e->>'brandId'=v_brand::text
      UNION ALL
      SELECT o.format_id::text,f.name,null::integer,false
      FROM public.pos_catalog_ownership o JOIN public.formats f ON f.id=o.format_id AND f.brewery_id=o.brewery_id
      WHERE o.connection_id=p_connection AND o.brand_id=v_brand AND o.catalog_group='poured'
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements((v_snapshot->'items')||(v_snapshot->'excluded')) e
          WHERE e->>'formatId'=o.format_id::text AND e->>'brandId'=v_brand::text)
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('formatId',s.format_id,'format',s.format_name,
      'priceCents',s.price_cents,'present',s.present,'externalVariationId',o.external_variation_id)
      ORDER BY s.format_name,s.format_id),'[]'::jsonb) INTO v_variations
    FROM source_rows s LEFT JOIN public.pos_catalog_ownership o ON o.connection_id=p_connection
      AND o.brand_id=v_brand AND o.catalog_group='poured' AND o.format_id=s.format_id::uuid
      AND o.external_item_id=v_external_item;
    v_manifest:=v_manifest||jsonb_build_array(jsonb_build_object('brandId',v_brand,'requestId',private.new_uuid(),
      'source',jsonb_build_object('brandId',v_brand,'brand',v_brand_name,'catalogGroup','poured',
        'locationId',v_snapshot#>>'{location,posLocationId}','ownership',v_ownership,
        'externalItemId',v_external_item,'variations',v_variations)));
  END LOOP;
  RETURN v_manifest;
END $function$;
