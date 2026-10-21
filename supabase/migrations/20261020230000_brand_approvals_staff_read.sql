-- #965: Catalog shows each brand's recorded COLA approvals, and list_brands
-- (every staff role) reads them by embedding brand_approvals. #770 limited
-- this table to Admin and Sales, the roles of get_compliance_registry; the
-- owner opened it to every staff role, taproom included. State registrations
-- and licenses stay Admin and Sales.
alter policy staff_read on public.brand_approvals
  using (brewery_id in (select public.my_staff_brewery_ids(enum_range(null::public.staff_role))));
