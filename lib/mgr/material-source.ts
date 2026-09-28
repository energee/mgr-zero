// lib/mgr/material-source.ts — one stock source is a material at a location,
// bin and lot. Brew day and packaging both key sources this way and both put
// a record's reversed stock back before a correction chooses replacements.
import { fromTicks, toTicks } from "./quantity-input";

export type SourceIds = { materialId: string; locationId: string; binId: string; lotId: string | null };

export const materialSourceKey = (s: SourceIds) => [s.materialId, s.locationId, s.binId, s.lotId ?? ""].join("/");

/** Copy `sources`, adding each reversed quantity back to its matching source
 *  (by `keyOf`) or appending the reversed source when none remains. */
export function restoreSources<S extends { qty: number }>(sources: S[], reversed: { source: S; qty: number }[], keyOf: (s: S) => string): S[] {
  const restored = sources.map(source => ({ ...source }));
  const byKey = new Map(restored.map(source => [keyOf(source), source]));
  for (const { source, qty } of reversed) {
    const found = byKey.get(keyOf(source));
    if (found) found.qty = fromTicks(toTicks(found.qty) + toTicks(qty));
    else { const added = { ...source, qty }; restored.push(added); byKey.set(keyOf(added), added); }
  }
  return restored;
}
