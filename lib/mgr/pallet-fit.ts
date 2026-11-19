// lib/mgr/pallet-fit.ts — advisory pallet fit for an order's lines. A format's
// pallet fit (formats.pallet_fit) is how many of that package fill one pallet
// unit, a layer or a pallet, however the brewery loads. Lines group by
// physical package (package type and size) across brands, so two brands'
// sixtels share a unit. Formats of one package with different fits stay
// apart: each group has exactly one fit, and the label names it. Nothing here
// is enforced; screens only show it.
import { SIZE_LABEL } from "./keg-labels";

/** One order line's quantity and its format's package facts. */
export type PalletLine = { qty: number; packageType: string | null; kegSize: string | null; unitsPerCase: number | null; palletFit: number | null };

export type PalletFitGroup = {
  key: string;
  /** The package in plural words: "⅙ bbl kegs", "Cases of 24 cans". */
  label: string;
  count: number;
  fit: number;
  full: number;
  /** Units in the last, partial pallet unit (0 when every unit is full). */
  remainder: number;
  /** How many more fill that partial unit. */
  toFill: number;
  /** "2 full ✓", "1 full + 3 · 7 to fill", or "3 · 7 to fill". */
  text: string;
};

/** The package as a reader names it, in the plural. */
function packageLabel(line: PalletLine): string {
  if (line.packageType === "keg") return line.kegSize ? `${SIZE_LABEL[line.kegSize] ?? line.kegSize} kegs` : "Kegs";
  if (!line.packageType) return "Packages";
  return line.unitsPerCase && line.unitsPerCase > 1 ? `Cases of ${line.unitsPerCase} ${line.packageType}s` : `${line.packageType[0].toUpperCase()}${line.packageType.slice(1)}s`;
}

function fitText(full: number, remainder: number, toFill: number): string {
  if (!remainder) return `${full} full ✓`;
  return `${full ? `${full} full + ` : ""}${remainder} · ${toFill} to fill`;
}

/** Per package group with a pallet fit, in first-line order: how many, how many
 *  full units, and what is left to fill the last one. Lines with no quantity or
 *  no fit are left out. */
export function palletFit(lines: PalletLine[]): PalletFitGroup[] {
  const groups = new Map<string, { label: string; fit: number; count: number }>();
  for (const line of lines) {
    if (!line.palletFit || !(line.qty > 0)) continue;
    const key = `${line.packageType}|${line.kegSize ?? line.unitsPerCase}|${line.palletFit}`;
    const group = groups.get(key) ?? { label: packageLabel(line), fit: line.palletFit, count: 0 };
    group.count += line.qty;
    groups.set(key, group);
  }
  const labels = [...groups.values()].map((g) => g.label);
  return [...groups].map(([key, { label, fit, count }]) => {
    const full = Math.floor(count / fit);
    const remainder = count % fit;
    const toFill = remainder ? fit - remainder : 0;
    // One package with two fits: name the fit so the two rows read apart.
    const named = labels.filter((l) => l === label).length > 1 ? `${label} (${fit} a unit)` : label;
    return { key, label: named, count, fit, full, remainder, toFill, text: fitText(full, remainder, toFill) };
  });
}

/** The phone bar's one-line nudge: the partial unit closest to full, when it is
 *  within a fifth of a unit of filling (the owner's "about 20%": a few more
 *  would fill it); otherwise nothing, so the bar stays quiet. */
export function palletHint(groups: PalletFitGroup[]): string | undefined {
  const near = groups.filter((g) => g.remainder && g.toFill <= g.fit / 5).sort((a, b) => a.toFill - b.toFill)[0];
  return near ? `${near.label} ${near.toFill} short of full` : undefined;
}
