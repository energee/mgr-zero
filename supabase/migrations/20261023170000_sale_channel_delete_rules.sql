-- Sale channel delete rules (#1207).
--
-- list_sale_channels moves from a table read to this RPC so each row carries
-- in_use: true when any row holding a foreign key to the channel exists
-- (inventory_movements, customers, orders, channel_prices, pos_menus), the
-- same keys that refuse delete_sale_channel. The list offers Delete only on a
-- channel that is neither in use nor the system Taproom. Security definer so
-- every role reads the same flag whatever its RLS on the referencing tables.
-- tests/sale-channels.test.ts pins the referencing tables: a new foreign key to
-- sale_channels must be added here too.
create function public.list_sale_channels(p_brewery uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff_read(p_brewery, array['admin','sales','warehouse']::public.staff_role[]);
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'tax_treatment', c.tax_treatment, 'system_code', c.system_code,
      'in_use', exists (select 1 from public.inventory_movements r where r.sale_channel_id = c.id and r.brewery_id = c.brewery_id)
        or exists (select 1 from public.customers r where r.sale_channel_id = c.id and r.brewery_id = c.brewery_id)
        or exists (select 1 from public.orders r where r.sale_channel_id = c.id and r.brewery_id = c.brewery_id)
        or exists (select 1 from public.channel_prices r where r.sale_channel_id = c.id and r.brewery_id = c.brewery_id)
        or exists (select 1 from public.pos_menus r where r.sale_channel_id = c.id and r.brewery_id = c.brewery_id)
    ) order by c.name), '[]'::jsonb)
    from public.sale_channels c where c.brewery_id = p_brewery);
end $$;
revoke all on function public.list_sale_channels(uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_sale_channels(uuid) to authenticated;

-- The movements check above runs for every channel on every list read, and
-- inventory_movements is the one large referencing table. The index also
-- serves the foreign key's own check when a channel is deleted.
create index movements_sale_channel_idx on public.inventory_movements (sale_channel_id, brewery_id)
  where sale_channel_id is not null;

-- The system Taproom channel (system_code 'taproom') is what taproom counts,
-- cellar Taproom removals and transfers resolve by, so it is never deleted,
-- even when nothing references it yet. It can still be renamed.
-- Otherwise unchanged from 00001_baseline.sql: a channel in use is held by a
-- foreign key, which raises 23503; the command turns that into 'channel is in use'.
create or replace function public.delete_sale_channel(
  p_brewery uuid, p_id uuid, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.sale_channels;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'delete_sale_channel', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id));
  if v_replay is not null then return v_replay; end if;
  select * into v_row from public.sale_channels where id = p_id and brewery_id = p_brewery;
  if not found then raise exception 'sale channel not found'; end if;
  if v_row.system_code = 'taproom' then
    raise exception 'the system Taproom channel cannot be deleted; rename it instead';
  end if;
  delete from public.sale_channels where id = p_id and brewery_id = p_brewery;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
