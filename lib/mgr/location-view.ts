// lib/mgr/location-view.ts — view-model for Location detail (list_locations + list_bins).
import { sentenceCase } from "./labels";

export type LocationViewModel = {
  backHref?: string;
  name: string;
  /** Every use this place is put to, titled. A site is often several at once. */
  uses: string[];
  useOptions: string[];
  timezone: string;
  bins: string;
  binsHref: string;
};

const USES = ["Warehouse", "Taproom", "Storage"];

export type LocationSnapshot = {
  location: { id: string; name: string; uses: string[] };
  bins: { name: string }[];
  /** Inventory: IANA zone after "Brewery default". Live omits this. */
  timezone?: string;
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
    uses: location.uses.map(sentenceCase),
    useOptions: USES,
    timezone: timezone ? `Brewery default · ${timezone}` : "Brewery default",
    bins: bins.map((b) => b.name).join(" · ") || "none",
    binsHref: `/locations/${location.id}/bins`,
  };
}
