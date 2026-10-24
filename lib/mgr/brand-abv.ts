// lib/mgr/brand-abv.ts — brand ABV bounds (#489): a percent from 0 up to what
// brands.abv numeric(4,2) holds. upsert_brand's schema and BrandView's stepper
// share them, so a form and an HTTP caller are refused the same readable way
// before the database would overflow. Pure: safe for commands and views alike.
export const BRAND_ABV = { min: 0, max: 99.99, message: "ABV must be a percent from 0 to 99.99" } as const;

/** Blank is optional; finer percentages remain valid and are rounded by storage. */
export function brandAbvError(value: string): string | undefined {
  if (value === "") return undefined;
  if (/[eE]/.test(value)) return "Enter a decimal number without exponent notation.";
  const abv = Number(value);
  return Number.isFinite(abv) && abv >= BRAND_ABV.min && abv <= BRAND_ABV.max ? undefined : BRAND_ABV.message;
}
