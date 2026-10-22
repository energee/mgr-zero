// lib/mgr/location-bins-view.ts — view-model for Location bins (list_bins,
// plus get_bin_move_stock for the readers allowed to see bin stock).
import type { EmptyState } from "@/lib/mgr/empty-state";
import { plural } from "@/lib/mgr/plural";

export type LocationBinsRowView = {
  key: string;
  title: string;
  detail: string;
};

export type LocationBinsViewModel = {
  title: string;
  backLabel: string;
  backHref?: string;
  rows: LocationBinsRowView[];
  /** Nothing is stored in any bin; the view draws it in place of Move stock. */
  empty?: EmptyState;
  /** Where the empty state's Open Inventory goes; fixtures leave it out. */
  inventoryHref?: string;
  /** Why Move stock is not offered here; the view draws it in place of the form. */
  moveUnavailable: string | null;
};

type Option = { value: string; label: string };
/** The Move stock fields; `destinations` already exclude the source bin. */
export type MoveStockValue = { source: string; toBinId: string; qty: string; note: string };
export type MoveStockOptions = { stock: Option[]; destinations: Option[]; unit?: string; wholeUnits: boolean; max?: number };

export type LocationBinsSnapshot = {
  location: { id: string; name: string };
  bins: { id: string; name: string }[];
  /** get_bin_move_stock rows, one per stock identity (SKU or material lot, keg
   *  size) a bin holds. Omitted when the reader may not see bin stock, so the
   *  rows claim neither a count nor Empty. */
  stock?: { bin_id: string }[];
  /** Inventory uses the parent screen name; live uses the location name. */
  backLabel?: string;
  backHref?: string;
  inventoryHref?: string;
};

/** One bin's row detail: how many stock rows it holds, or nothing when stock
 *  was not read. The page reads every get_bin_move_stock row for Move stock
 *  anyway, so the count comes from those rows rather than a second query. */
function holds(stock: LocationBinsSnapshot["stock"], binId: string): string {
  if (!stock) return "";
  const n = stock.filter((s) => s.bin_id === binId).length;
  return n ? `${plural(n, "item")} on hand` : "Empty";
}

export function toLocationBinsViewProps({
  location,
  bins,
  stock,
  backLabel,
  backHref,
  inventoryHref,
}: LocationBinsSnapshot): LocationBinsViewModel {
  return {
    title: `Bins at ${location.name}`,
    backLabel: backLabel ?? location.name,
    backHref,
    rows: bins.map((b) => ({ key: b.id, title: b.name, detail: holds(stock, b.id) })),
    empty: stock?.length === 0 ? { title: "Nothing is stored in these bins yet", description: "Move stock here from Inventory." } : undefined,
    inventoryHref,
    moveUnavailable: stock?.length && bins.length < 2 ? "Moving stock needs at least two bins at this location. Add a bin first." : null,
  };
}
