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

export type PriceGroup = { name: string; formats: PriceGroupFormat[] };

/** The two reads the chain needs, injected so the resolver stays pure. */
export type BarcodeLookup = {
  brandGroup: (brand: string) => string | undefined;
  group: (name: string) => PriceGroup | undefined;
};

/** The barcode a brand's SKU scans as in one format, or null if it has none. */
export function resolveBarcode(
  lookup: BarcodeLookup,
  brand: string,
  format: string,
): string | null {
  const groupName = lookup.brandGroup(brand);
  if (!groupName) return null;
  const group = lookup.group(groupName);
  if (!group) return null;
  return group.formats.find((f) => f.format === format)?.upc ?? null;
}
