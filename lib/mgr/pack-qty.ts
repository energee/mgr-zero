// lib/mgr/pack-qty.ts — a base-unit amount read and entered as whole packs plus
// loose base units, using the material's pack size (materials.purchase_uom_factor:
// base units per purchase unit, so a 50 lb sack has factor 50). Brew prep and
// the brew-day timeline both show "4 × 50 lb + 20 lb" and take packs plus loose
// pounds back. Arithmetic runs in ticks so 4.4 sacks is exactly 220 lb.
import { fromTicks, toTicks } from "./quantity-input";

/** Whole packs in `qty` and the base units left over. */
export function splitPacks(qty: number, factor: number): { packs: number; loose: number } {
  const total = toTicks(qty), size = toTicks(factor);
  const whole = Math.floor(total / size);
  return { packs: whole, loose: fromTicks(total - whole * size) };
}

/** "4 × 50 lb + 20 lb"; an amount under one pack, or a factor of 1, stays in base units. */
export function packs(qty: number, factor: number, unit: string): string {
  const split = splitPacks(qty, factor);
  if (factor === 1 || split.packs === 0) return `${qty} ${unit}`;
  const whole = `${split.packs} × ${factor} ${unit}`;
  return split.loose ? `${whole} + ${split.loose} ${unit}` : whole;
}

/** Base units in `packs` packs (decimals allowed) plus `loose` base units. */
export function fromPacks(packs: number, loose: number, factor: number): number {
  return fromTicks(Math.round(packs * toTicks(factor)) + toTicks(loose));
}
