// lib/mgr/brand-lines.ts — how an order line or orderable SKU is named, on staff
// order screens and in the portal: from its brand and format, never the SKU name
// (which may carry the brand's alias in place of the brand). The brand's alias
// is kept apart so a view shows it muted on its own line (BrandedName,
// components/mgr/views/branded-name.tsx). Confirm order groups lines under their
// brand; Pick groups them under their format.

export type BrandedSku = { name: string; brands?: { name: string; alias?: string | null } | null; formats?: { name: string } | null } | null;

/** A name and, when the brand has one, its alias for a muted line under it. */
export type LineLabel = { name: string; alias?: string };

const aliasOf = (sku: BrandedSku) => (sku?.brands?.alias ? { alias: sku.brands.alias } : {});

/** "Masai Giraffe · Sixtel" with alias "Animal #31"; a SKU read without brand and format keeps its own name. */
export function lineLabel(sku: BrandedSku): LineLabel {
  return sku?.brands && sku.formats ? { name: `${sku.brands.name} · ${sku.formats.name}`, ...aliasOf(sku) } : { name: sku?.name ?? "Line" };
}

/** The brand heading (its alias apart) and format label for a line. A SKU without both keeps its own name and no heading. */
export function brandLabel(sku: BrandedSku): LineLabel & { group?: string } {
  return sku?.brands && sku.formats ? { group: sku.brands.name, ...aliasOf(sku), name: sku.formats.name } : { name: sku?.name ?? "Line" };
}

/** True when line i is the first of its brand, where the brand is named. */
export function startsGroup(lines: { group?: string }[], i: number): boolean {
  return Boolean(lines[i].group) && lines[i].group !== lines[i - 1]?.group;
}

/** Lines sorted by brand, then format, so each brand's lines sit together under one heading. */
export function byBrand<T extends { skus: BrandedSku }>(lines: T[]): T[] {
  const key = (l: T) => [l.skus?.brands?.name ?? "", brandLabel(l.skus).name];
  return lines.toSorted((a, b) => { const [ab, af] = key(a), [bb, bf] = key(b); return ab.localeCompare(bb) || af.localeCompare(bf); });
}

/** Pick sheets name the format once, then list its brands, each with its alias apart. */
export function formatLabel(sku: BrandedSku): LineLabel & { group?: string } {
  const { group, name, ...alias } = brandLabel(sku);
  return group ? { group: name, name: group, ...alias } : { name };
}

/** Formats together across brands, then brands in name order within each format. */
export function byFormat<T extends { skus: BrandedSku }>(lines: T[]): T[] {
  return lines.toSorted((a, b) => {
    const al = formatLabel(a.skus), bl = formatLabel(b.skus);
    return (al.group ?? "").localeCompare(bl.group ?? "") || al.name.localeCompare(bl.name);
  });
}
