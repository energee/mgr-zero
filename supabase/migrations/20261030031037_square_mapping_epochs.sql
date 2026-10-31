-- #1662: preserve historical attribution across explicit mapping retirement.
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
    AND external_location_id=s.external_location_id AND brewery_id=p_brewery AND s.sold_at>=mapping_started_at FOR SHARE;
  IF v_location IS NULL THEN
    SELECT location_id INTO v_location FROM public.pos_location_mapping_history
      WHERE connection_id=s.connection_id AND external_location_id=s.external_location_id AND brewery_id=p_brewery
        AND starts_at<=s.sold_at AND ends_at>s.sold_at;
  END IF;
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


CREATE OR REPLACE FUNCTION public.set_pos_location_mapping (
  p_brewery           uuid,
  p_external_location text,
  p_location          uuid,
  p_request_id        uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE c uuid; old_location uuid; replay jsonb; result jsonb; menu_cleared boolean:=false;
BEGIN
  PERFORM private.assert_staff(p_brewery,ARRAY['admin']::public.staff_role[]);
  replay:=private.claim_command_request(p_brewery,'set_pos_location_mapping',p_request_id,jsonb_build_object('posLocationId',p_external_location,'mgrLocationId',p_location));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  SELECT id INTO c FROM public.pos_connections WHERE brewery_id=p_brewery AND provider='square' AND state='connected' FOR UPDATE;
  IF c IS NULL OR NOT EXISTS(SELECT 1 FROM public.locations WHERE id=p_location AND brewery_id=p_brewery) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  SELECT location_id INTO old_location FROM public.pos_locations WHERE connection_id=c AND external_location_id=p_external_location AND brewery_id=p_brewery FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Square location not found'; END IF;
  IF old_location IS DISTINCT FROM p_location AND old_location IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.pos_sales_coverage WHERE connection_id=c AND external_location_id=p_external_location AND location_id=old_location) THEN
    RAISE EXCEPTION 'Square location mapping has observed history and cannot be changed in place' USING errcode='MG409';
  END IF;
  IF old_location IS DISTINCT FROM p_location THEN
    DELETE FROM public.pos_menus WHERE connection_id=c AND external_location_id=p_external_location;
    menu_cleared:=FOUND;
  END IF;
  BEGIN
    UPDATE public.pos_locations SET location_id=p_location WHERE connection_id=c AND external_location_id=p_external_location;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'MGR location is already claimed by another Square location' USING errcode='MG409'; END;
  UPDATE public.pos_sales_coverage SET location_id=p_location
    WHERE connection_id=c AND external_location_id=p_external_location AND location_id IS NULL
      AND starts_at>=(SELECT mapping_started_at FROM public.pos_locations WHERE connection_id=c AND external_location_id=p_external_location);
  PERFORM private.reconcile_pos_sale(p_brewery,s.id) FROM public.pos_sales s LEFT JOIN public.pos_sale_expectations e ON e.sale_id=s.id
    WHERE s.connection_id=c AND s.external_location_id=p_external_location AND e.sale_id IS NULL;
  result:=jsonb_build_object('mapped',true,'menuCleared',menu_cleared);
  RETURN private.complete_command_request(p_request_id,result);
END $function$;

