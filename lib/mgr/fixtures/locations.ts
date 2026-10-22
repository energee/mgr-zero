// lib/mgr/fixtures/locations.ts — list_locations / list_bins snapshots for
// the Locations family inventory frames. Identities from demo.ts.
import { LOC_TAPROOM, LOC_WAREHOUSE } from "./demo";
import type { BinSnapshot } from "@/lib/mgr/bin-view";
import type { LocationSnapshot } from "@/lib/mgr/location-view";
import type { LocationBinsSnapshot } from "@/lib/mgr/location-bins-view";
import type { LocationsSnapshot } from "@/lib/mgr/locations-view";

const BIN_WALKIN = "00000000-0000-4000-8000-0000000000b1";
const BIN_COLD = "00000000-0000-4000-8000-0000000000b2";
const BIN_DRY = "00000000-0000-4000-8000-0000000000b3";

const TAPROOM_BINS = [
  { id: BIN_WALKIN, name: "Walk-in" },
  { id: BIN_COLD, name: "Cold" },
  { id: BIN_DRY, name: "Dry" },
] as const;

/** Settings → Locations: Warehouse units plus the Taproom, which pours, stores
 *  and ships from one building — the case a single `kind` could never say. */
export const locationsList: LocationsSnapshot = {
  locations: [
    { id: LOC_WAREHOUSE.id, name: LOC_WAREHOUSE.name, uses: ["warehouse"], units: 186 },
    { id: LOC_TAPROOM.id, name: LOC_TAPROOM.name, uses: ["storage", "taproom", "warehouse"], taps: 11, bins: 3 },
  ],
};

/** Taproom facts for Location detail. */
export const locationTaproom: LocationSnapshot = {
  location: { id: LOC_TAPROOM.id, name: LOC_TAPROOM.name, uses: ["storage", "taproom", "warehouse"] },
  bins: TAPROOM_BINS.map((b) => ({ name: b.name })),
  timezone: "America/New_York",
};

/** Taproom Walk-in / Cold / Dry. `stock` is get_bin_move_stock's one row per
 *  stock identity: three in Walk-in, one in Cold, and Dry holds nothing. */
export const locationBinsTaproom: LocationBinsSnapshot = {
  location: { id: LOC_TAPROOM.id, name: LOC_TAPROOM.name },
  backLabel: "Location detail",
  bins: [...TAPROOM_BINS],
  stock: [{ bin_id: BIN_WALKIN }, { bin_id: BIN_WALKIN }, { bin_id: BIN_WALKIN }, { bin_id: BIN_COLD }],
};

/** Cold bin sheet. */
export const binCold: BinSnapshot = {
  id: BIN_COLD,
  name: "Cold",
};
