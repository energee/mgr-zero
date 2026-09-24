-- Brand ABV is a percent from 0 to 99.99 (#489). The command schema and the
-- brand form already say so (lib/mgr/brand-abv.ts); this holds every other
-- writer to it too, notably the CSV import, which calls upsert_brand from SQL.
-- NOT VALID: existing rows are left for review rather than failing the deploy.
alter table public.brands add constraint brands_abv_range check (abv is null or (abv >= 0 and abv <= 99.99)) not valid;
