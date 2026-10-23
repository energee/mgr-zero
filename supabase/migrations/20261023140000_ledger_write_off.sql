-- write_off_invoice also accepts an unpaid invoice MGR's payment ledger owns
-- (#1228; docs/plans/invoice-local-payments.md Q9). Owner decision 2026-10-23:
-- an invoice with unvoided local payments can be written off for its remaining
-- balance, and the payments stay as they are.
-- Copied from: 20260910120847_deploy_current_schema.sql:1656; only the
-- eligibility check and its message are new. Roles, the reason rule, replay,
-- security definer and search_path are unchanged; create or replace keeps the grants.
CREATE OR REPLACE FUNCTION public.write_off_invoice (
  p_brewery    uuid,
  p_invoice    uuid,
  p_reason     text,
  p_request_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_actor uuid; v_inv public.invoices; v_replay jsonb; v_result jsonb;
begin
  v_actor:=private.assert_staff(p_brewery,array['admin']::public.staff_role[]);
  if nullif(btrim(p_reason),'') is null or length(btrim(p_reason))>500 then raise exception 'write-off reason must be 1 to 500 characters'; end if;
  v_replay:=private.claim_command_request(p_brewery,'write_off_invoice',p_request_id,
    jsonb_build_object('invoiceId',p_invoice,'reason',btrim(p_reason)));
  if v_replay is not null then return v_replay; end if;
  select * into v_inv from public.invoices where id=p_invoice and brewery_id=p_brewery for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.kind<>'invoice' or v_inv.written_off_at is not null or not (
      v_inv.qbo_remote_state in ('voided','deleted')
      -- Ledger-owned and unpaid, as invoiceLedgerOwnsBalance (lib/mgr/invoice-state.ts):
      -- no QuickBooks identity, not paid, and no pending or earlier push
      -- (invoice_push_facts returns a row only for an invoice with one).
      or (v_inv.qbo_invoice_id is null and v_inv.paid_at is null
        and not exists (select 1 from public.invoice_push_facts(p_brewery, array[p_invoice])))
  ) then
    raise exception 'only an invoice QuickBooks voided or deleted, or an unpaid one QuickBooks never received, can be written off';
  end if;
  update public.invoices set written_off_at=now(),written_off_by=v_actor,written_off_reason=btrim(p_reason)
    where id=p_invoice and brewery_id=p_brewery;
  v_result:=jsonb_build_object('invoiceId',p_invoice,'status','written_off','reason',btrim(p_reason));
  return private.complete_command_request(p_request_id,v_result);
end $function$;
