-- #965: Catalog shows each brand's recorded COLA approvals, and list_brands
-- (every staff role) reads them by embedding brand_approvals. #770 limited
-- this table to Admin and Sales, the roles of get_compliance_registry. The
-- owner approved COLA facts for every staff role, taproom included: other
-- roles read only COLA rows, while formula approvals stay Admin and Sales,
-- as do state registrations and licenses.
alter policy staff_read on public.brand_approvals
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales']::public.staff_role[]))
    or (kind = 'cola' and brewery_id in (select public.my_staff_brewery_ids(enum_range(null::public.staff_role)))));
