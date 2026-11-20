// lib/mgr/pallet-fit.ts — advisory pallet fit for an order's lines. A format's
// pallet fit (formats.pallet_fit) is how many of that package fill one pallet
// unit, a layer or a pallet, however the brewery loads. Lines group by
// physical package (package type and size) across brands, so two brands'
// sixtels share a unit. Formats of one package with different fits stay
// apart: each group has exactly one fit, and the label names it. Nothing here
// is enforced; screens only show it.
import { SIZE_LABEL } from "./keg-labels";

/** One order line's quantity and its format's package facts. */
export type PalletLine = {
  qty: number; packageType: string | null; kegSize: string | null; unitsPerCase: number | null; palletFit: number | null;
  /** formats.pallet_fit_mixed: how many fill a keg layer that another keg size shares, used only while the brewery has no keg layer table; absent or null reads as palletFit. */
  palletFitMixed?: number | null;
  /** One full unit's weight in pounds, beer and packaging; absent or null adds no weight. */
  unitLb?: number | null;
  /** formats.height_in: how tall one keg stands or one case sits in a layer, in inches; absent or null adds no height. */
  heightIn?: number | null;
};

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

// A whole pallet, from the owner's stacking notes (2026-11-20): a 48×40 pallet
// takes at most two keg layers, and layers of cases wherever height is left,
// up to a height and a weight. A layer is as tall as its format's height. The
// brewery's numbers are PalletRules, edited in Settings (breweries.pallet_rules).
export type PalletRules = {
  /** The most one pallet carries, in pounds. */
  maxLb: number;
  /** The tallest a loaded pallet stands from the floor, and the empty pallet's own height, in inches. */
  maxHeightIn: number;
  palletHeightIn: number;
  /** The ways one keg layer loads, each a count per keg size: { half_bbl: 6, sixth_bbl: 6 }. */
  kegLayers: Record<string, number>[];
};
export const DEFAULT_PALLET_RULES: PalletRules = { maxLb: 2500, maxHeightIn: 60, palletHeightIn: 5.5, kegLayers: [] };
/** A barrel of beer at 1.010, in pounds: the weight used when a batch has no gravity reading. */
export const BEER_LB_PER_BBL = 261.3;

/** Fewest keg layers for the kegs, where a layer holds what one row of the
 *  table allows. Each size's own pallet fit is also a row, so a size the
 *  table leaves out still loads. */
function tableKegLayers(kegs: PalletLine[], table: Record<string, number>[]): number {
  const count = new Map<string, number>();
  const rows = [...table];
  for (const l of kegs) {
    const size = l.kegSize ?? "";
    if (!count.has(size)) rows.push({ [size]: l.palletFit! });
    count.set(size, (count.get(size) ?? 0) + l.qty);
  }
  const sizes = [...count.keys()];
  const memo = new Map<string, number>();
  // ponytail: tries every row at every step, remembered by what is left; fine for the hundred or so kegs an order holds.
  const need = (left: number[]): number => {
    if (left.every((n) => n <= 0)) return 0;
    const key = left.join();
    const known = memo.get(key);
    if (known !== undefined) return known;
    let best = Infinity;
    for (const row of rows) {
      const after = left.map((n, i) => Math.max(0, n - (row[sizes[i]] ?? 0)));
      if (after.join() !== key) best = Math.min(best, 1 + need(after));
    }
    memo.set(key, best);
    return best;
  };
  return need(sizes.map((s) => count.get(s)!));
}

/** Keg layers without a table: full layers of each size, and the part-full
 *  ones sharing a layer by each format's fit when mixed. */
function fitKegLayers(kegs: PalletLine[]): number {
  let layers = 0;
  const partial: number[] = []; // each size's last, part-full layer as a share of a shared layer
  for (const group of Map.groupBy(kegs, (l) => `${l.kegSize}|${l.palletFit}`).values()) {
    const fit = group[0].palletFit!;
    const count = group.reduce((n, l) => n + l.qty, 0);
    layers += Math.floor(count / fit);
    if (count % fit) partial.push((count % fit) / (group[0].palletFitMixed ?? fit));
  }
  // Shares that add up to 1 fill one shared layer, so the part-full ones need their sum, rounded up.
  return layers + (partial.length > 1 ? Math.ceil(partial.reduce((a, b) => a + b, 0) - 1e-9) : partial.length);
}

/** True when every layer (a height in inches) can be set on some pallet's remaining room. */
function layersFit(layers: number[], room: number[]): boolean {
  const left = [...room];
  // ponytail: tallest layer first into the tightest pallet that takes it; a rare mix of case heights may count one pallet too many.
  for (const height of layers) {
    const best = left.reduce((pick, r, i) => (r + 1e-9 >= height && (pick < 0 || r < left[pick]) ? i : pick), -1);
    if (best < 0) return false;
    left[best] -= height;
  }
  return true;
}

/** Fewest pallets that carry the lines; 0 when nothing with a pallet fit is ordered. */
export function palletCount(lines: PalletLine[], rules: PalletRules = DEFAULT_PALLET_RULES): number {
  const ordered = lines.filter((l) => l.qty > 0);
  const fitted = ordered.filter((l) => l.palletFit);
  if (!fitted.length) return 0;
  const kegs = fitted.filter((l) => l.packageType === "keg");
  const kegLayers = rules.kegLayers.length ? tableKegLayers(kegs, rules.kegLayers) : fitKegLayers(kegs);
  const usable = rules.maxHeightIn - rules.palletHeightIn;
  // A keg layer is as tall as the tallest keg ordered.
  const kegHeight = Math.max(0, ...kegs.map((l) => l.heightIn ?? 0));
  // Cases of one height share layers; each layer is that tall. A case with no height adds none.
  const caseLayersByHeight = new Map<number, number>();
  for (const l of fitted) if (l.packageType !== "keg" && l.heightIn) caseLayersByHeight.set(l.heightIn, (caseLayersByHeight.get(l.heightIn) ?? 0) + l.qty / l.palletFit!);
  const caseLayers = [...caseLayersByHeight].sort(([a], [b]) => b - a)
    // A layer taller than the room still takes a pallet of its own.
    .flatMap(([height, layers]) => Array<number>(Math.ceil(layers - 1e-9)).fill(Math.min(height, usable)));
  // Weight counts every line that has one, pallet fit or not.
  const lb = ordered.reduce((n, l) => n + l.qty * (l.unitLb ?? 0), 0);
  // ponytail: weight is checked on the whole load, not per pallet; pack per pallet if mixed loads come out wrong.
  for (let pallets = Math.max(1, Math.ceil(lb / rules.maxLb)); ; pallets++) {
    // `double` pallets carry two keg layers, `single` one, and the rest none; cases go wherever height is left.
    for (let double = 0; double <= pallets; double++) {
      if (double && 2 * kegHeight > usable + 1e-9) break;
      const single = Math.max(0, kegLayers - 2 * double);
      const rest = pallets - double;
      if (single > rest) continue;
      const room = [...Array<number>(double).fill(usable - 2 * kegHeight), ...Array<number>(single).fill(usable - kegHeight), ...Array<number>(rest - single).fill(usable)];
      if (layersFit(caseLayers, room)) return pallets;
    }
  }
}

export type PalletLoad = {
  pallets: number;
  /** Per package, how many more ride on the same pallets (only packages with room). */
  room: { label: string; more: number }[];
  /** "1 pallet. Room for 3 more ½ bbl kegs or 20 more cases of 24 cans." or "2 full pallets ✓". */
  text: string;
};

/** The pallets an order's lines need and the room left on them. `kinds` are
 *  the packages to report room for (their qty is ignored); absent, the lines'
 *  own. Undefined when nothing with a pallet fit is ordered. */
export function palletLoad(lines: PalletLine[], kinds: PalletLine[] = lines, rules: PalletRules = DEFAULT_PALLET_RULES): PalletLoad | undefined {
  const pallets = palletCount(lines, rules);
  if (!pallets) return undefined;
  const seen = new Set<string>();
  const room = kinds.flatMap((kind) => {
    const label = packageLabel(kind);
    if (!kind.palletFit || seen.has(label)) return [];
    seen.add(label);
    let more = 0;
    // A pallet holds at most a few hundred of anything, so counting up is cheap.
    while (more < 500 && palletCount([...lines, { ...kind, qty: more + 1 }], rules) === pallets) more++;
    return more ? [{ label, more }] : [];
  });
  const count = `${pallets} ${room.length ? "" : "full "}pallet${pallets === 1 ? "" : "s"}`;
  // Labels are plural; one more reads in the singular ("1 more ⅙ bbl keg", "1 more case of 24 cans").
  const one = (label: string) => (label.startsWith("Cases of") ? label.replace("Cases", "Case") : label.replace(/s$/, ""));
  const parts = room.map((r) => { const label = r.more === 1 ? one(r.label) : r.label; return `${r.more} more ${label[0].toLowerCase()}${label.slice(1)}`; });
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} or ${parts.at(-1)}` : parts[0];
  return { pallets, room, text: room.length ? `${count}. Room for ${list}.` : `${count} ✓` };
}
