// lib/mgr/location-bins-view.ts — view-model for the Bins section of
// Location detail (list_bins, plus get_bin_move_stock for the readers allowed
// to see bin stock).
import type { EmptyState } from "@/lib/mgr/empty-state";
import { plural } from "@/lib/mgr/plural";

export type LocationBinsRowView = {
  key: string;
  title: string;
  detail: string;
};

export type LocationBinsViewModel = {
  rows: LocationBinsRowView[];
  /** Nothing is stored in any bin; the view draws it in place of Move stock. */
  empty?: EmptyState;
  /** Where the empty state's Record movement goes; fixtures leave it out. */
  inventoryHref?: string;
  /** Why Move stock is not offered here; the view draws it in place of the form. */
  moveUnavailable: string | null;
};

type Option = { value: string; label: string };
/** The Move stock fields; `destinations` already exclude the source bin. */
export type MoveStockValue = { source: string; toBinId: string; qty: string; note: string };
export type MoveStockOptions = { stock: Option[]; destinations: Option[]; unit?: string; wholeUnits: boolean; max?: number };

export type LocationBinsSnapshot = {
  bins: { id: string; name: string }[];
  /** get_bin_move_stock rows, one per stock identity (SKU or material lot, keg
   *  size) a bin holds. Omitted when the reader may not see bin stock, so the
   *  rows claim neither a count nor Empty. */
  stock?: { bin_id: string }[];
  inventoryHref?: string;
};

/** One bin's row detail, one of three labels: "N kinds of stock" (its
 *  get_bin_move_stock rows), "Empty" (stock was read and the bin has none), or
 *  "" (stock was not read because the reader may not see it, so the row claims
 *  nothing). A kind is not a unit count: 400 cases of one SKU is one kind. The
 *  page reads every get_bin_move_stock row for Move stock anyway, so the count
 *  comes from those rows rather than a second query. */
function binStockLabel(stock: LocationBinsSnapshot["stock"], binId: string): string {
  if (!stock) return "";
  const n = stock.filter((s) => s.bin_id === binId).length;
  return n ? `${plural(n, "kind")} of stock` : "Empty";
}

export function toLocationBinsViewProps({
  bins,
  stock,
  inventoryHref,
}: LocationBinsSnapshot): LocationBinsViewModel {
  return {
    rows: bins.map((b) => ({ key: b.id, title: b.name, detail: binStockLabel(stock, b.id) })),
    empty: stock?.length === 0 ? { title: "Nothing is stored in these bins yet", description: "Record stock into a bin from Inventory." } : undefined,
    inventoryHref,
    // Only once some bin holds stock: with none, the empty state shows instead.
    moveUnavailable: stock !== undefined && stock.length > 0 && bins.length < 2 ? "Moving stock needs at least two bins at this location. Add a bin first." : null,
  };
}
