// lib/mgr/pack-qty.ts — a base-unit amount read and entered as whole packs plus
// loose base units, using the material's pack size (materials.purchase_uom_factor:
// base units per purchase unit, so a 50 lb sack has factor 50). Brew prep and
// the brew-day timeline both show "4 × 50 lb + 20 lb" and take packs plus loose
// pounds back. Each product rounds to ticks so 4.4 sacks is exactly 220 lb; the
// factor itself is never rounded: materials keeps it to the same 4 decimals
// (a check constraint) and the receipt ledger multiplies by all of them.
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

/** Base units in `packs` packs (decimals allowed) plus `loose` base units. */
export function fromPacks(packs: number, loose: number, factor: number): number {
  return fromTicks(toTicks(packs * factor) + toTicks(loose));
}
