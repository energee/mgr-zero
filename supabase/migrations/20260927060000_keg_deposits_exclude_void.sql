-- #617: a keg deposit is held only while the document that charged it is owed.
-- An invoice voided or deleted in QuickBooks (qbo_remote_state <> 'live') or
-- written off locally (written_off_at) no longer counts, which is the same
-- test invoice_totals.collected_cents and create_credit_memo_impl use. A
-- keg_deposit_refund line counts while its credit memo is live, and drops when
-- the deposit invoice it credits (credited_invoice_line_id) stops counting:
-- that deposit is gone, so refunding it would leave negative kegs on deposit.
-- Same columns in the same order as the baseline view, so create or replace
-- keeps its grants; security_invoker keeps RLS on the caller.
create or replace view public.keg_deposit_balances with (security_invoker = true) as
  select i.brewery_id, i.customer_id, l.keg_pool_id, l.keg_size,
         sum(l.qty)::int as kegs_on_deposit, sum(l.amount_cents)::int as deposit_cents
  from public.invoice_lines l
  join public.invoices i on i.id = l.invoice_id
  left join public.invoice_lines src on src.id = l.credited_invoice_line_id
  left join public.invoices si on si.id = src.invoice_id
  where l.kind in ('keg_deposit','keg_deposit_refund')
    and i.qbo_remote_state = 'live' and i.written_off_at is null
    and (si.id is null or (si.qbo_remote_state = 'live' and si.written_off_at is null))
  group by 1,2,3,4;
