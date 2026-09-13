// lib/mgr/location-view.ts — view-model for Location detail (list_locations + list_bins).

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

function titleKind(kind: string): string {
  if (kind === "warehouse") return "Warehouse";
  if (kind === "taproom") return "Taproom";
  if (kind === "storage") return "Storage";
  return kind;
}

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
    uses: location.uses.map(titleKind),
    useOptions: USES,
    timezone: timezone ? `Brewery default · ${timezone}` : "Brewery default",
    bins: bins.map((b) => b.name).join(" · ") || "none",
    binsHref: `/locations/${location.id}/bins`,
  };
}
