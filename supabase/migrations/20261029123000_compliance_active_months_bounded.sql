-- #1607: the Compliance list's activity scan read the finished-goods ledger
-- twice, and both reads covered the brewery's whole history up to p_end.
-- It called report_movements, which has no start date, and then
-- destination_state_facts, whose movement rows only repeat months that first
-- read already found. The scan now reads each source once, and only rows
-- dated in p_start..p_end:
--   1. ledger rows from inventory_movements, with report_movements' own
--      books_opened_on bound. Every report_movements row is one ledger row on
--      its occurred_on date, so these are the same months.
--   2. cellar removals (report_cellar_removals, unchanged).
--   3. invoice lines: the invoice branch of destination_state_facts, with its
--      export exclusion (a line whose shipment's removals name a country).
-- A month still counts exactly when generate_compliance_report would read a
-- row dated in it.
-- Copied from: 20261023160000_compliance_active_months.sql; only the reads
-- are new. create or replace keeps security definer, search_path and grants.
create or replace function public.list_compliance_active_months(p_brewery uuid, p_start date, p_end date)
returns date[] language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff_read(p_brewery, array['admin','sales']::public.staff_role[]);
  return (
    select coalesce(array_agg(distinct date_trunc('month', a.d::timestamp)::date), '{}')
    from (
      select m.occurred_on as d
      from public.breweries b
      join public.inventory_movements m on m.brewery_id = b.id
        and m.occurred_on between greatest(p_start, coalesce(b.books_opened_on, '-infinity'::date)) and p_end
      where b.id = p_brewery
      union all
      select c.d from private.report_cellar_removals(p_brewery, p_start, p_end) c
      union all
      select i.issued_on
      from public.invoice_lines line join public.invoices i on i.id = line.invoice_id and i.brewery_id = line.brewery_id
      left join public.invoice_lines original_line on original_line.id = line.credited_invoice_line_id and original_line.brewery_id = line.brewery_id
      left join public.invoices original_invoice on original_invoice.id = original_line.invoice_id and original_invoice.brewery_id = line.brewery_id
      left join public.shipments shipment on shipment.id = coalesce(i.shipment_id, original_invoice.shipment_id) and shipment.brewery_id = i.brewery_id
      where i.brewery_id = p_brewery and i.issued_on between p_start and p_end and line.kind = 'sku'
        -- an invoice or credit line for a shipment out of the US has no state
        and not exists (select 1 from public.inventory_movements exported
                        where exported.brewery_id = p_brewery and exported.type = 'sale_removal'
                          and exported.ref = shipment.order_id and exported.sku_id = line.sku_id
                          and exported.dest_country is not null)
    ) a);
end $$;
