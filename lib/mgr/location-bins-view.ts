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
};

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
