-- #450: one bin/lot stock check for every staff-entered movement.
-- The form path of record_inventory_movement only refused a lot-less removal
-- when lot-tracked rows existed in the bin, so a loss against untracked stock
-- could drive the bin negative (and then block taproom counts). The chat
-- preview (inventory_movement_proposal) already refused that. Both now call
-- private.assert_movement_stock. Bodies below copy the latest definitions
-- (20260913140000_location_multi_use.sql, 20260913110000_hosted_schema_catchup.sql)
-- with only the stock check replaced.

-- Refuses a removal larger than the selected bin's stock for the selected lot
-- (the lot-less rows when p_lot is null). Callers hold the ledger lock.
create or replace function private.assert_movement_stock(p_brewery uuid, p_sku uuid, p_location uuid,
  p_bin uuid, p_lot uuid, p_qty numeric)
 returns void
 language plpgsql
 set search_path to ''
as $function$
begin
  if p_qty >= 0 then return; end if;
  if -p_qty > (select coalesce(sum(qty),0) from public.inventory_movements
    where brewery_id=p_brewery and sku_id=p_sku and location_id=p_location
      and bin_id=p_bin and lot_id is not distinct from p_lot) then
    if p_lot is null and exists(select 1 from public.inventory_movements
      where brewery_id=p_brewery and sku_id=p_sku and location_id=p_location and bin_id=p_bin and lot_id is not null)
      then raise exception 'choose the recorded lot for this removal'; end if;
    raise exception 'insufficient selected bin and lot stock';
  end if;
end $function$;

revoke all on function private.assert_movement_stock(uuid, uuid, uuid, uuid, uuid, numeric) from public;
grant execute on function private.assert_movement_stock(uuid, uuid, uuid, uuid, uuid, numeric) to postgres;

CREATE OR REPLACE FUNCTION private.inventory_movement_proposal(p_brewery uuid, p_sku uuid, p_location uuid, p_bin uuid, p_qty numeric, p_type movement_type, p_sale_channel uuid, p_dest_state text, p_note text, p_lot uuid, p_lock boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_meta jsonb; v_lot jsonb; v_channel jsonb; v_stock_qty numeric; v_stock_bbl numeric;
  v_brand uuid; v_format uuid;
  v_movement_count bigint; v_movement_ids jsonb; v_components jsonb; v_registration jsonb;
  v_effects jsonb; v_warnings jsonb := '[]'::jsonb; v_version jsonb;
begin
  if p_type not in ('opening_balance','production_in','adjustment','depletion','return_in','destruction','loss','sample','festival_removal')
    then raise exception 'movement type is not supported in chat'; end if;
  if p_qty is null or p_qty::text in ('NaN','Infinity','-Infinity') or p_qty=0 or p_qty<>round(p_qty,2)
    then raise exception 'invalid movement quantity'; end if;

  if (p_type in ('opening_balance','production_in','return_in') and p_qty<0)
     or (p_type in ('depletion','destruction','loss','sample','festival_removal') and p_qty>0)
    then raise exception 'movement quantity has the wrong sign for its type'; end if;
  if (p_type='depletion') is distinct from (p_sale_channel is not null)
    then raise exception 'depletion requires a sale channel and other movements cannot carry one'; end if;
  if (p_type in ('sample','festival_removal')) is distinct from (p_dest_state is not null)
    or (p_dest_state is not null and p_dest_state !~ '^[A-Z]{2}$')
    then raise exception 'sample and festival removals require a two-letter destination state'; end if;

  if p_lock then
    select brand_id,format_id into v_brand,v_format from public.skus
      where id=p_sku and brewery_id=p_brewery for share;
    perform 1 from public.brands where id=v_brand and brewery_id=p_brewery for share;
    -- The parent row conflicts with complete component replacement, including
    -- inserting a child where no component row existed at preview time.
    perform 1 from public.formats where id=v_format and brewery_id=p_brewery for share;
    perform 1 from public.format_components where brewery_id=p_brewery
      and parent_format_id=v_format order by child_format_id for share;
    perform 1 from public.formats where brewery_id=p_brewery and id in (
      select child_format_id from public.format_components
      where brewery_id=p_brewery and parent_format_id=v_format
    ) order by id for share;
    perform 1 from public.locations where id=p_location and brewery_id=p_brewery for share;
    perform 1 from public.bins where id=p_bin and location_id=p_location and brewery_id=p_brewery for share;
  end if;
  -- Each statement gets a fresh READ COMMITTED snapshot. Build displayed
  -- metadata only after every relevant row lock has completed.
  select jsonb_build_object(
    'skuId',s.id,'skuName',s.name,'skuActive',s.active,
    'brandId',br.id,'brandName',br.name,'formatId',f.id,'formatName',f.name,
    'packageType',f.package_type,'bblPerUnit',fv.bbl_per_unit,
    'locationId',l.id,'locationName',l.name,'locationUses',l.uses,'binId',b.id,'binName',b.name
  ) into v_meta
  from public.skus s
  join public.brands br on br.id=s.brand_id and br.brewery_id=s.brewery_id
  join public.formats f on f.id=s.format_id and f.brewery_id=s.brewery_id
  join public.format_volumes fv on fv.id=f.id and fv.brewery_id=f.brewery_id
  join public.locations l on l.id=p_location and l.brewery_id=s.brewery_id
  join public.bins b on b.id=p_bin and b.location_id=l.id and b.brewery_id=l.brewery_id
  where s.id=p_sku and s.brewery_id=p_brewery;
  if v_meta is null then raise exception 'invalid movement selection'; end if;
  if not (v_meta->>'skuActive')::boolean then raise exception 'inactive SKU cannot receive a new movement'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',child.id,'name',child.name,'qty',fc.qty,
    'bblPerUnit',child.bbl_per_unit) order by child.id),'[]'::jsonb) into v_components
  from public.format_components fc join public.formats child
    on child.id=fc.child_format_id and child.brewery_id=fc.brewery_id
  where fc.brewery_id=p_brewery and fc.parent_format_id=(v_meta->>'formatId')::uuid;

  if p_lot is not null then
    if p_lock then perform 1 from public.lots where id=p_lot and brewery_id=p_brewery for share; end if;
    select to_jsonb(lot) into v_lot from public.lots lot where id=p_lot and brewery_id=p_brewery;
    if not found or not exists(select 1 from public.inventory_movements
      where brewery_id=p_brewery and sku_id=p_sku and lot_id=p_lot)
      then raise exception 'lot does not belong to SKU'; end if;
  end if;

  if p_sale_channel is not null then
    if p_lock then perform 1 from public.sale_channels where id=p_sale_channel and brewery_id=p_brewery for share; end if;
    select jsonb_build_object('id',id,'name',name,'taxTreatment',tax_treatment)
      into v_channel from public.sale_channels where id=p_sale_channel and brewery_id=p_brewery;
    if not found then raise exception 'invalid sale channel'; end if;
  end if;

  select count(*),coalesce(sum(qty),0),coalesce(sum(bbl),0),coalesce(jsonb_agg(id order by id),'[]'::jsonb)
    into v_movement_count,v_stock_qty,v_stock_bbl,v_movement_ids
  from public.inventory_movements where brewery_id=p_brewery and sku_id=p_sku and location_id=p_location
    and bin_id=p_bin and lot_id is not distinct from p_lot;
  perform private.assert_movement_stock(p_brewery,p_sku,p_location,p_bin,p_lot,p_qty);

  if p_dest_state is not null then
    if p_lock then perform 1 from public.state_registrations where brewery_id=p_brewery
      and brand_id=(v_meta->>'brandId')::uuid and state=p_dest_state for share; end if;
    select to_jsonb(r) into v_registration from (
      select id,state,registration_no,approved_on,expires_on from public.state_registrations
      where brewery_id=p_brewery and brand_id=(v_meta->>'brandId')::uuid and state=p_dest_state
    ) r;
    if v_registration is null or (v_registration->>'approved_on')::date>current_date
       or (v_registration->>'expires_on')::date<current_date then
      v_warnings:=jsonb_build_array((v_meta->>'brandName')||' is not registered in '||p_dest_state);
    end if;
  end if;

  v_version:=jsonb_build_object(
    'sku',jsonb_build_object('id',v_meta->>'skuId','name',v_meta->>'skuName','active',(v_meta->>'skuActive')::boolean),
    'brand',jsonb_build_object('id',v_meta->>'brandId','name',v_meta->>'brandName'),
    'format',jsonb_build_object('id',v_meta->>'formatId','name',v_meta->>'formatName',
      'packageType',v_meta->>'packageType','bblPerUnit',(v_meta->>'bblPerUnit')::numeric,'components',v_components),
    'location',jsonb_build_object('id',v_meta->>'locationId','name',v_meta->>'locationName','uses',v_meta->'locationUses'),
    'bin',jsonb_build_object('id',v_meta->>'binId','name',v_meta->>'binName'),
    'lot',case when p_lot is null then null else jsonb_build_object('id',v_lot->>'id','code',v_lot->>'code','packagedOn',v_lot->>'packaged_on','bestBy',v_lot->>'best_by') end,
    'channel',v_channel,
    'registration',v_registration,
    'proposal',jsonb_build_object('qty',p_qty,'type',p_type,'destState',p_dest_state,'note',p_note),
    'stock',jsonb_build_object('movementCount',v_movement_count,'movementIds',v_movement_ids,'qty',v_stock_qty,'bbl',v_stock_bbl));
  v_effects:=jsonb_build_array(jsonb_build_object(
    'label',(v_meta->>'skuName')||' · '||(v_meta->>'locationName')||' · '||(v_meta->>'binName'),
    'qty',p_qty::text,'bbl',round(p_qty*(v_meta->>'bblPerUnit')::numeric,8)::text,
    'stockBeforeQty',v_stock_qty::text,'stockAfterQty',(v_stock_qty+p_qty)::text,
    'stockBeforeBbl',v_stock_bbl::text,'stockAfterBbl',round(v_stock_bbl+p_qty*(v_meta->>'bblPerUnit')::numeric,8)::text,
    'type',p_type,'taxTreatment',v_channel->>'taxTreatment','destinationState',p_dest_state,
    'correction',case when p_type in ('adjustment','loss') then 'reverse_inventory_movement' else null end));
  return jsonb_build_object('effects',v_effects,'warnings',v_warnings,'version',v_version);
end $function$
;

CREATE OR REPLACE FUNCTION public.record_inventory_movement (
  p_brewery       uuid,
  p_sku           uuid,
  p_location      uuid,
  p_bin           uuid,
  p_qty           numeric,
  p_type          public.movement_type,
  p_sale_channel  uuid,
  p_dest_state    text,
  p_note          text,
  p_request_id    uuid,
  p_lot           uuid                 DEFAULT NULL::uuid,
  p_origin        text                 DEFAULT 'ui'::text,
  p_conversation  uuid                 DEFAULT NULL::uuid,
  p_preview_token uuid                 DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_replay jsonb; v_row public.inventory_movements; v_tax public.tax_treatment; v_actor uuid; v_input jsonb;
  v_preview private.command_previews; v_current jsonb;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  if (p_origin='chat') is distinct from (p_conversation is not null and p_preview_token is not null)
    then raise exception 'chat preview token required'; end if;
  if p_origin not in ('ui','chat') then raise exception 'invalid command origin'; end if;
  if p_origin='chat' and p_type not in ('opening_balance','production_in','adjustment','depletion','return_in','destruction','loss','sample','festival_removal')
    then raise exception 'movement type is not supported in chat'; end if;
  v_input := jsonb_build_object('brewery', p_brewery, 'sku', p_sku, 'location', p_location, 'bin', p_bin, 'qty', p_qty, 'type', p_type, 'sale_channel', p_sale_channel, 'dest_state', p_dest_state, 'note', p_note, 'lot', p_lot);
  v_replay := private.claim_command_request(p_brewery, 'record_inventory_movement', p_request_id, v_input,
    p_origin,p_conversation,p_preview_token);
  if v_replay is not null then return v_replay; end if;

  if not exists (select 1 from public.skus where id = p_sku and brewery_id = p_brewery and active) then
    raise exception 'inactive SKU cannot receive a new movement';
  end if;
  if (p_type in ('sample','festival_removal','sale_removal')
      and (p_dest_state is null or p_dest_state !~ '^[A-Z]{2}$'))
     or (p_type not in ('sample','festival_removal','sale_removal') and p_dest_state is not null) then
    raise exception 'classified removals require a two-letter uppercase destination state';
  end if;

  if p_origin='chat' then
    select * into v_preview from private.command_previews
      where token=p_preview_token and actor_id=v_actor and brewery_id=p_brewery
        and command_name='record_movement' and rpc_name='record_inventory_movement'
        and canonical_input=v_input and conversation_id=p_conversation;
    if not found then raise exception 'invalid preview token'; end if;
    if v_preview.expires_at<=now() then raise exception 'expired preview token'; end if;
    -- ponytail: serializes inventory writers; upgrade to shared per-stock
    -- locks across every writer if throughput requires.
    lock table public.inventory_movements in share row exclusive mode;
    v_current:=private.inventory_movement_proposal(p_brewery,p_sku,p_location,p_bin,p_qty,p_type,
      p_sale_channel,p_dest_state,p_note,p_lot,true);
    if v_current->'version' is distinct from v_preview.version
       or v_current->'effects' is distinct from v_preview.effects
       or v_current->'warnings' is distinct from v_preview.warnings then
      raise exception 'preview changed; preview again' using errcode='MG409';
    end if;
    v_tax:=(v_current->'effects'->0->>'taxTreatment')::public.tax_treatment;
  else
    if p_qty is null or p_qty::text in ('NaN','Infinity','-Infinity') or p_qty = 0 or p_qty <> round(p_qty,2) then raise exception 'invalid movement quantity'; end if;
    if p_lot is not null and not exists (select 1 from public.inventory_movements where brewery_id = p_brewery and sku_id = p_sku and lot_id = p_lot)
      then raise exception 'lot does not belong to SKU'; end if;
    if p_qty < 0 then
    -- ponytail: global ledger lock; shared stock-key locks across every writer at higher throughput.
      lock table public.inventory_movements in share row exclusive mode;
      -- #450: the same bin/lot stock check the chat preview applies.
      perform private.assert_movement_stock(p_brewery,p_sku,p_location,p_bin,p_lot,p_qty);
    end if;
    -- A staff-entered movement has no customer, so the channel default is the
    -- resolved treatment; the composite FK below rejects another brewery's channel.
    if p_sale_channel is not null then
      select tax_treatment into v_tax from public.sale_channels
       where id = p_sale_channel and brewery_id = p_brewery;
    end if;
  end if;
  insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, qty, type, sale_channel_id, tax_treatment, dest_state, note, created_by)
    values (p_brewery, p_sku, p_location, p_bin, p_lot, p_qty, p_type, p_sale_channel, v_tax, p_dest_state, p_note, auth.uid()) returning * into v_row;
  if p_origin='chat' then
    insert into private.chat_messages(conversation_id,brewery_id,actor_id,role,result,request_id)
      values(p_conversation,p_brewery,v_actor,'result',to_jsonb(v_row),p_request_id);
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $function$;

