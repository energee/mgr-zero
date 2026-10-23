// lib/mgr/location-view.ts — view-model for Location detail (list_locations + list_bins).
import type { LocationUse } from "./enums";
import { locationUsesLabel, timezoneLabel } from "./labels";

export type LocationViewModel = {
  backHref?: string;
  name: string;
  /** Every use this place is put to, as stored; the Uses picker selects these. */
  uses: LocationUse[];
  /** The same uses as staff read them: "Storage · Taproom · Warehouse". */
  usesLabel: string;
  timezone: string;
  bins: string;
  binsHref: string;
};

export type LocationSnapshot = {
  location: { id: string; name: string; uses: LocationUse[] };
  bins: { name: string }[];
  /** The brewery's IANA zone (Settings → Timezone); a location has none of its own. */
  timezone: string;
  backHref?: string;
};

export function toLocationViewProps({
  location,
  bins,
  timezone,
  backHref,
}: LocationSnapshot): LocationViewModel {
  return {
    backHref,
    name: location.name,
    uses: location.uses,
    usesLabel: locationUsesLabel(location.uses),
    timezone: `Brewery default · ${timezoneLabel(timezone)}`,
    bins: bins.map((b) => b.name).join(" · ") || "none",
    binsHref: `/locations/${location.id}/bins`,
  };
}
