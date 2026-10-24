// lib/mgr/brand-lines.ts — order lines grouped under their brand, each named
// by its format, as Confirm order and Pick draw them.
import { nameWithAlias } from "./labels";

export type BrandedSku = { name: string; brands?: { name: string; alias?: string | null } | null; formats?: { name: string } | null } | null;

/** The brand heading (with its staff alias, as Catalog shows it) and format label for a line. A SKU without both keeps its own name and no heading. */
export function brandLabel(sku: BrandedSku): { group?: string; name: string } {
  return sku?.brands && sku.formats ? { group: nameWithAlias(sku.brands), name: sku.formats.name } : { name: sku?.name ?? "Line" };
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

/** Pick sheets name the format once, then list its brands with their staff aliases. */
export function formatLabel(sku: BrandedSku): { group?: string; name: string } {
  const label = brandLabel(sku);
  return label.group ? { group: label.name, name: label.group } : label;
}

/** Formats together across brands, then brands in name order within each format. */
export function byFormat<T extends { skus: BrandedSku }>(lines: T[]): T[] {
  return lines.toSorted((a, b) => {
    const al = formatLabel(a.skus), bl = formatLabel(b.skus);
    return (al.group ?? "").localeCompare(bl.group ?? "") || al.name.localeCompare(bl.name);
  });
}
