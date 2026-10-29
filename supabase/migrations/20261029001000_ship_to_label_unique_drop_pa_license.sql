-- Two owner decisions (2026-10-28), one migration.
--
-- 1. #1487: a customer's ship-to labels are unique, ignoring case and outer
--    spaces, so the server refuses the duplicate the form already withholds.
--    Hosted held no duplicate group when this was approved (2 ship-tos).
--    upsert_ship_to's 23505 reads "Key (…, lower(btrim(label)))=…", which the
--    command maps to the form's duplicate-label message under Label.
create unique index ship_tos_customer_label_key
  on public.ship_tos (brewery_id, customer_id, lower(btrim(label)));

-- 2. #1517: breweries.pa_license_no was retired by 20261028231100, which
--    copied every number into brewery_state_licenses (PA, brewery). Nothing
--    reads or writes it, and hosted held no non-blank value.
alter table public.breweries drop column pa_license_no;
