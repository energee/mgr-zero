// lib/mgr/price-group-barcode.ts — a SKU's barcode is not stored on the SKU.
// It resolves brand -> price group -> (group x format) UPC, with no override
// at any hop, which is what makes a rotating series ring up identically at a
// retailer. Every hop is allowed to be missing: a brand with no group, a
// format the group never priced, and a format that legitimately carries no
// retail code (a keg moves on lot numbers) all answer null rather than throw.
// Pure and lookup-injected, so tests/price-group-barcode.test.ts walks the
// chain without a database, matching lib/mgr/screen-links.ts.

/** One format's price-group facts. `upc` is null when the format has no retail code. */
export type PriceGroupFormat = { format: string; upc: string | null };

/** The two lookups the chain needs, injected so the resolver stays pure. */
export type BarcodeLookup = {
  brandGroup: (brand: string) => string | undefined;
  formats: (group: string) => readonly PriceGroupFormat[] | undefined;
};

/** The barcode a brand's SKU scans as in one format, or null if it has none. */
export function resolveBarcode(
  lookup: BarcodeLookup,
  brand: string,
  format: string,
): string | null {
  const group = lookup.brandGroup(brand);
  if (!group) return null;
  return lookup.formats(group)?.find((f) => f.format === format)?.upc ?? null;
}
