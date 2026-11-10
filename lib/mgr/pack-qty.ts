// lib/mgr/pack-qty.ts — a base-unit amount read and entered as whole packs plus
// loose base units, using the material's pack size (materials.purchase_uom_factor:
// base units per purchase unit, so a 50 lb sack has factor 50). Brew prep and
// the brew-day timeline both show "4 × 50 lb + 20 lb" and take packs plus loose
// pounds back. Each product rounds to ticks so 4.4 sacks is exactly 220 lb; the
// factor itself is never rounded: materials keeps it to the same 4 decimals
// (a check constraint) and the receipt ledger multiplies by all of them.
// The recipe sheet reads a batch amount another way (packText): whole packs as
// a count, "23 bags" with the material's pack word (materials.pack_name) or
// "19 × 50 lb" without one, and any other amount in its unit. A recipe stores
// amounts per bbl: batchQty scales one to a batch, and perBblForPacks is the
// way back, from a count of packs to the per-bbl amount.
import type { PackName } from "./enums";
import { plural } from "./plural";
import { fromTicks, toTicks } from "./quantity-input";

/** Whole packs in `qty` and the base units left over; fromPacks(packs, loose) gives `qty` back exactly. */
export function splitPacks(qty: number, factor: number): { packs: number; loose: number } {
  const total = toTicks(qty);
  let whole = Math.floor(qty / factor);
  // Float division can land one pack off either way (220.4623 / 2.204623); settle it in ticks.
  if (toTicks((whole + 1) * factor) <= total) whole += 1;
  else if (whole > 0 && toTicks(whole * factor) > total) whole -= 1;
  return { packs: whole, loose: fromTicks(total - toTicks(whole * factor)) };
}

/** "4 × 50 lb + 20 lb"; an amount under one pack, or a factor of 1, stays in base units. */
export function packs(qty: number, factor: number, unit: string): string {
  const split = splitPacks(qty, factor);
  if (factor === 1 || split.packs === 0) return `${qty} ${unit}`;
  const whole = `${split.packs} × ${factor} ${unit}`;
  return split.loose ? `${whole} + ${split.loose} ${unit}` : whole;
}

/** "220 lb = 4 × 50 lb + 20 lb", or just "220 lb" when packs() stays in base units. */
export function withPacks(qty: number, factor: number, unit: string): string {
  const base = `${qty} ${unit}`, inPacks = packs(qty, factor, unit);
  return inPacks === base ? base : `${base} = ${inPacks}`;
}

/** More than one of each pack word; a new word in PACK_NAMES has to say its own. */
const PACK_PLURALS: Record<PackName, string> = { bag: "bags", sack: "sacks", box: "boxes", bottle: "bottles", pitch: "pitches", pail: "pails", drum: "drums", tote: "totes" };

/** What to call several packs: the pack word's plural ("bags"), or "packs" for a material with no word. */
export const packNoun = (packName: PackName | null): string => (packName ? PACK_PLURALS[packName] : "packs");

/** A material's pack: base units per pack, its base unit, and the word it is sold by. */
export type Pack = { factor: number; unit: string; packName: PackName | null };

/** A material has a pack when it has a pack size, or a pack word: one counted in "each" is its own pack once it is
 *  sold by a word, so one yeast reads "1 pitch". A size of 1 with no word is a material with no pack. */
export const hasPack = ({ factor, packName }: Pick<Pack, "factor" | "packName">): boolean => factor !== 1 || packName !== null;

/** A batch amount as the recipe sheet reads it. Whole packs read as a count: "23 bags" with the pack word, "19 × 50 lb"
 *  without one. Loose units, an amount under one pack, or a material with no pack size stay in the unit: "8.8 lb". */
export function packText(qty: number, { factor, unit, packName }: Pack): string {
  const split = splitPacks(qty, factor);
  const whole = hasPack({ factor, packName }) && split.packs > 0 && split.loose === 0;
  if (whole && packName) return plural(split.packs, packName, PACK_PLURALS[packName]);
  return whole ? packs(qty, factor, unit) : `${qty} ${unit}`;
}

/** A per-bbl amount at a batch of `bbl`, to the 4 decimals material quantities store (as brew day scales it). */
export const batchQty = (perBbl: number, bbl: number): number => fromTicks(toTicks(perBbl * bbl));

/** The per-bbl amount that makes `count` packs at a batch of `bbl`, to the 6 decimals per_bbl_qty stores. */
export const perBblForPacks = (count: number, factor: number, bbl: number): number => Number((count * factor / bbl).toFixed(6));

/** Base units in `packs` packs (decimals allowed) plus `loose` base units. */
export function fromPacks(packs: number, loose: number, factor: number): number {
  return fromTicks(toTicks(packs * factor) + toTicks(loose));
}
