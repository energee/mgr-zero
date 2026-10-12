-- Invoice due dates freeze customer terms at issue time for every insert path.
create function private.payment_term_days(p_terms text) returns int
language plpgsql immutable set search_path = '' as $$
begin
  case p_terms
    when 'due_on_receipt' then return 0;
    when 'net15' then return 15;
    when 'net30' then return 30;
    else raise exception 'unknown payment terms %', p_terms;
  end case;
end $$;
revoke all on function private.payment_term_days(text) from public, anon, authenticated, service_role;

-- Definer execution lets service-role inserts call the revoked private helper,
-- like invoices_no; the customer lookup stays bound to the invoice's tenant.
create function private.set_invoice_due_on() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'invoice' and new.due_on is null then
    select new.issued_on + private.payment_term_days(c.payment_terms)
      into new.due_on
      from public.customers c
     where c.id = new.customer_id and c.brewery_id = new.brewery_id;
  end if;
  return new;
end $$;
revoke all on function private.set_invoice_due_on() from public, anon, authenticated, service_role;

create trigger invoices_set_due_on before insert on public.invoices
  for each row execute function private.set_invoice_due_on();

-- Historical terms were not stored: existing undated invoices use current terms.
-- Explicit dates and credit memos are unchanged; no QuickBooks push is started.
update public.invoices i
   set due_on = i.issued_on + private.payment_term_days(c.payment_terms)
  from public.customers c
 where i.kind = 'invoice' and i.due_on is null
   and c.id = i.customer_id and c.brewery_id = i.brewery_id;
