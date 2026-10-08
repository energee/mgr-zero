// lib/mgr/location-bins-view.ts — view-model for Location bins (list_bins).

export type LocationBinsRowView = {
  key: string;
  title: string;
  detail: string;
};

export type LocationBinsViewModel = {
  backLabel: string;
  backHref?: string;
  rows: LocationBinsRowView[];
  /** Why Move stock is not offered here; the view draws it in place of the form. */
  moveUnavailable?: string | null;
};

type Option = { value: string; label: string };
/** The Move stock fields; `destinations` already exclude the source bin. */
export type MoveStockValue = { source: string; toBinId: string; qty: string; note: string };
export type MoveStockOptions = { stock: Option[]; destinations: Option[]; unit?: string; wholeUnits: boolean; max?: number };

export type LocationBinsSnapshot = {
  location: { id: string; name: string };
  bins: { id: string; name: string; detail?: string }[];
  /** Inventory uses the parent screen name; live uses the location name. */
  backLabel?: string;
  backHref?: string;
};

export function toLocationBinsViewProps({
  location,
  bins,
  backLabel,
  backHref,
}: LocationBinsSnapshot): LocationBinsViewModel {
  return {
    backLabel: backLabel ?? location.name,
    backHref,
    rows: bins.map((b) => ({
      key: b.id,
      title: b.name,
      detail: b.detail ?? "",
    })),
  };
}
