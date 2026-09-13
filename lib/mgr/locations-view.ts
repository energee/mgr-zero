// lib/mgr/locations-view.ts — view-model for the Locations list (list_locations).
import type { EmptyState } from "./empty-state";
import { plural } from "./plural";
import { sentenceCase } from "./labels";

export type LocationsRowView = {
  key: string;
  title: string;
  detail: string;
  href: string;
};

export type LocationsViewModel = {
  rows: LocationsRowView[];
  empty?: EmptyState;
  backHref?: string;
};

export type LocationsRowSnapshot = {
  id: string;
  name: string;
  /** Every use this place is put to; a site may be taproom and storage at once. */
  uses: string[];
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
  const uses = l.uses.map(sentenceCase).join(" · ");
  return extras.length ? `${uses} · ${extras.join(" · ")}` : uses;
}

export function toLocationsViewProps({ locations, backHref }: LocationsSnapshot): LocationsViewModel {
  return {
    backHref,
    empty: locations.length === 0 ? { title: "No locations yet", description: "Add the places you hold stock: the cellar, a taproom, a cold box." } : undefined,
    rows: locations.map((l) => ({
      key: l.id,
      title: l.name,
      detail: detail(l),
      href: `/locations/${l.id}`,
    })),
  };
}
