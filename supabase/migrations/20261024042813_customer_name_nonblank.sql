-- Customer names are trimmed and nonblank for creates and edits, including
-- direct RPC callers. Keep the original request payload for durable replays.
-- Copied from: 20261016100500_customer_country_alias.sql.
create or replace function public.upsert_customer(
  p_brewery uuid, p_id uuid, p_name text, p_type public.customer_type, p_state text,
  p_sale_channel uuid, p_license_no text, p_payment_terms text, p_tax_treatment public.tax_treatment, p_request_id uuid,
  p_alias text default null, p_country text default 'US'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_replay jsonb; v_row public.customers; v_terms text := nullif(btrim(p_payment_terms), ''); v_payload jsonb;
  -- The whitespace characters removed by the command schema's String.trim().
  v_name text := btrim(p_name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_payload := jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'type', p_type, 'state', p_state, 'sale_channel', p_sale_channel, 'license_no', p_license_no, 'payment_terms', p_payment_terms, 'tax_treatment', p_tax_treatment);
  if p_alias is not null then v_payload := v_payload || jsonb_build_object('alias', p_alias); end if;
  if p_country is distinct from 'US' then v_payload := v_payload || jsonb_build_object('country', p_country); end if;
  v_replay := private.claim_command_request(p_brewery, 'upsert_customer', p_request_id, v_payload);
  if v_replay is not null then return v_replay; end if;
  if v_name is null or v_name = '' then raise exception 'a customer name is required' using errcode = '22023'; end if;
  if p_sale_channel is null then raise exception 'customer needs a sale channel' using errcode = 'P0001'; end if;
  if p_id is null then
    insert into public.customers (brewery_id, name, type, state, sale_channel_id, license_no, payment_terms, tax_treatment, alias, country)
      values (p_brewery, v_name, p_type, p_state, p_sale_channel, p_license_no, coalesce(v_terms, 'net30'), p_tax_treatment, p_alias, p_country) returning * into v_row;
  else
    update public.customers set name = v_name, type = p_type, state = p_state, sale_channel_id = p_sale_channel,
      license_no = p_license_no, payment_terms = coalesce(v_terms, payment_terms), tax_treatment = p_tax_treatment,
      alias = p_alias, country = p_country
      where id = p_id and brewery_id = p_brewery returning * into v_row;
    if not found then raise exception 'customer not found'; end if;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.upsert_customer(uuid, uuid, text, public.customer_type, text, uuid, text, text, public.tax_treatment, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.upsert_customer(uuid, uuid, text, public.customer_type, text, uuid, text, text, public.tax_treatment, uuid, text, text) to authenticated;
