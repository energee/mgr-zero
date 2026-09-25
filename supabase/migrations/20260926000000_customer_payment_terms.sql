-- #491: customer payment terms are the vendor list (due_on_receipt, net15,
-- net30), matching lib/mgr/enums.ts PAYMENT_TERMS. Free text written before
-- this maps case-, space- and underscore-insensitively; anything unrecognised
-- becomes the default, net30. Nothing computes a due date from these yet.

create function private.normalize_payment_terms(p_terms text) returns text
language sql immutable set search_path = '' as $$
  select case lower(regexp_replace(coalesce(p_terms, ''), '[\s_]', '', 'g'))
    when 'net30' then 'net30'
    when 'net15' then 'net15'
    when 'dueonreceipt' then 'due_on_receipt'
    when 'onreceipt' then 'due_on_receipt'
    when 'cod' then 'due_on_receipt'
    else 'net30' end
$$;

update public.customers set payment_terms = private.normalize_payment_terms(payment_terms)
  where payment_terms is distinct from private.normalize_payment_terms(payment_terms);
update public.vendors set payment_terms = private.normalize_payment_terms(payment_terms)
  where payment_terms is distinct from private.normalize_payment_terms(payment_terms);

drop function private.normalize_payment_terms(text);

alter table public.customers add constraint customers_payment_terms_check
  check (payment_terms in ('due_on_receipt', 'net15', 'net30'));
alter table public.vendors add constraint vendors_payment_terms_check
  check (payment_terms in ('due_on_receipt', 'net15', 'net30'));

-- A CSV import row with an empty paymentTerms cell reaches upsert_customer as
-- '' (import_csv_row passes r->>'paymentTerms'); treat it as omitted so it
-- takes the default instead of failing the new check. Body otherwise as the
-- baseline.
create or replace function public.upsert_customer(
  p_brewery uuid, p_id uuid, p_name text, p_type public.customer_type, p_state text,
  p_sale_channel uuid, p_license_no text, p_payment_terms text, p_tax_treatment public.tax_treatment, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.customers; v_terms text := nullif(btrim(p_payment_terms), '');
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_customer', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'type', p_type, 'state', p_state, 'sale_channel', p_sale_channel, 'license_no', p_license_no, 'payment_terms', p_payment_terms, 'tax_treatment', p_tax_treatment));
  if v_replay is not null then return v_replay; end if;
  if p_sale_channel is null then raise exception 'customer needs a sale channel' using errcode = 'P0001'; end if;
  if p_id is null then
    insert into public.customers (brewery_id, name, type, state, sale_channel_id, license_no, payment_terms, tax_treatment)
      values (p_brewery, p_name, p_type, p_state, p_sale_channel, p_license_no, coalesce(v_terms, 'net30'), p_tax_treatment) returning * into v_row;
  else
    update public.customers set name = p_name, type = p_type, state = p_state, sale_channel_id = p_sale_channel,
      license_no = p_license_no, payment_terms = coalesce(v_terms, payment_terms), tax_treatment = p_tax_treatment
      where id = p_id and brewery_id = p_brewery returning * into v_row;
    if not found then raise exception 'customer not found'; end if;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
