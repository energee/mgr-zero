// lib/mgr/locations-view.ts — view-model for the Locations list (list_locations).
import { plural } from "./plural";

export type LocationsRowView = {
  key: string;
  title: string;
  detail: string;
  href: string;
};

export type LocationsViewModel = {
  rows: LocationsRowView[];
  empty?: string;
  backHref?: string;
};

export type LocationsRowSnapshot = {
  id: string;
  name: string;
  kind: string;
  /** Inventory: on-hand units. Live omits this. */
  units?: number;
  /** Inventory: tap count. Live omits this. */
  taps?: number;
  /** Inventory: bin count. Live omits this. */
  bins?: number;
};

export type LocationsSnapshot = {
  locations: LocationsRowSnapshot[];
  backHref?: string;
};

function detail(l: LocationsRowSnapshot): string {
  const extras: string[] = [];
  if (l.units != null) extras.push(plural(l.units, "inventory unit"));
  if (l.taps != null) extras.push(plural(l.taps, "tap"));
  if (l.bins != null) extras.push(plural(l.bins, "bin"));
  return extras.length ? `${l.kind} · ${extras.join(" · ")}` : l.kind;
}

export function toLocationsViewProps({ locations, backHref }: LocationsSnapshot): LocationsViewModel {
  return {
    backHref,
    empty: locations.length === 0 ? "No locations yet" : undefined,
    rows: locations.map((l) => ({
      key: l.id,
      title: l.name,
      detail: detail(l),
      href: `/locations/${l.id}`,
    })),
  };
}
