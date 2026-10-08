-- #770: business-record reads follow the command role gates.
--
-- Every staff_read policy below was `is_staff_of(brewery_id)`, true for
-- admin, sales, warehouse and brewer alike, while the commands that read these
-- tables (list_invoices, list_customers, list_channel_prices,
-- list_compliance_reports, ...) admit fewer roles. A brewer could read every
-- customer, price and invoice through PostgREST that /api/command refused.
-- Each policy now names the roles of the commands that read its table.
--
-- Tables not listed keep is_staff_of: the Beer landing (get_beer_overview, all
-- staff roles) counts through views over them, so narrowing them would read 0.

-- my_brewery_ids() narrowed to roles. Used as `brewery_id in (select ...)` it
-- runs once per statement and is hashed, instead of once per row.
create function public.my_staff_brewery_ids(p_roles public.staff_role[]) returns setof uuid
  language sql stable security definer set search_path = '' as
$$ select brewery_id from public.brewery_users
   where user_id = auth.uid() and role = any(p_roles) and private.request_scope_allows(brewery_id) $$;
revoke all on function public.my_staff_brewery_ids(public.staff_role[]) from public, anon;
grant execute on function public.my_staff_brewery_ids(public.staff_role[]) to authenticated;

-- admin, sales and warehouse: the order, invoice, delivery, transfer and lot read commands admit exactly these roles
alter policy staff_read on public.customers using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales', 'warehouse']::public.staff_role[])));
alter policy staff_read on public.ship_tos using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales', 'warehouse']::public.staff_role[])));
alter policy staff_read on public.orders using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales', 'warehouse']::public.staff_role[])));
alter policy staff_read on public.order_lines using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales', 'warehouse']::public.staff_role[])));
alter policy staff_read on public.order_events using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales', 'warehouse']::public.staff_role[])));
alter policy staff_read on public.order_deposit_lines using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales', 'warehouse']::public.staff_role[])));
alter policy staff_read on public.shipments using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales', 'warehouse']::public.staff_role[])));
alter policy staff_read on public.invoices using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales', 'warehouse']::public.staff_role[])));
alter policy staff_read on public.invoice_lines using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales', 'warehouse']::public.staff_role[])));
alter policy staff_read on public.deliveries using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales', 'warehouse']::public.staff_role[])));
alter policy staff_read on public.routes using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales', 'warehouse']::public.staff_role[])));
alter policy staff_read on public.stock_transfers using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales', 'warehouse']::public.staff_role[])));
alter policy staff_read on public.stock_transfer_lines using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales', 'warehouse']::public.staff_role[])));
alter policy staff_read on public.sale_channels using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales', 'warehouse']::public.staff_role[])));
alter policy staff_read on public.lots using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales', 'warehouse']::public.staff_role[])));

-- admin and sales: invoice questions, the price grid, and the compliance registry and filings
alter policy staff_read on public.invoice_questions using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales']::public.staff_role[])));
alter policy staff_read on public.channel_prices using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales']::public.staff_role[])));
alter policy staff_read on public.report_filings using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales']::public.staff_role[])));
alter policy staff_read on public.brand_approvals using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales']::public.staff_role[])));
alter policy staff_read on public.state_registrations using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales']::public.staff_role[])));
alter policy staff_read on public.brewery_state_licenses using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales']::public.staff_role[])));

-- admin and warehouse: POS sales feed taproom counts and variance
alter policy staff_read on public.pos_sales using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'warehouse']::public.staff_role[])));

-- admin and warehouse, keeping the taproom branch these tables already had
alter policy staff_read on public.pos_sale_expectations using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'warehouse']::public.staff_role[])) or public.taproom_can(brewery_id, 'pos_sale_expectations'));
alter policy staff_read on public.pos_sales_coverage using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'warehouse']::public.staff_role[])) or public.taproom_can(brewery_id, 'pos_sales_coverage'));
alter policy staff_read on public.pos_item_mappings using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'warehouse']::public.staff_role[])) or public.taproom_can(brewery_id, 'pos_item_mappings'));
alter policy staff_read on public.pos_locations using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'warehouse']::public.staff_role[])) or public.taproom_can(brewery_id, 'pos_locations'));

