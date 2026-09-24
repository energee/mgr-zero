// lib/mgr/brand-abv.ts — brand ABV bounds (#489): a percent from 0 up to what
// brands.abv numeric(4,2) holds. upsert_brand's schema and BrandView's stepper
// share them, so a form and an HTTP caller are refused the same readable way
// before the database would overflow. Pure: safe for commands and views alike.
export const BRAND_ABV = { min: 0, max: 99.99, message: "ABV must be a percent from 0 to 99.99" } as const;
