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

/** Settings → Locations: Warehouse units plus Taproom taps and bins. */
export const locationsList: LocationsSnapshot = {
  locations: [
    { id: LOC_WAREHOUSE.id, name: LOC_WAREHOUSE.name, kind: "warehouse", units: 186 },
    { id: LOC_TAPROOM.id, name: LOC_TAPROOM.name, kind: "taproom", taps: 11, bins: 3 },
  ],
};

/** Taproom facts for Location detail. */
export const locationTaproom: LocationSnapshot = {
  location: { id: LOC_TAPROOM.id, name: LOC_TAPROOM.name, kind: "taproom" },
  bins: TAPROOM_BINS.map((b) => ({ name: b.name })),
  timezone: "America/New_York",
};

/** Taproom Walk-in / Cold / Dry with inventory qty copy. */
export const locationBinsTaproom: LocationBinsSnapshot = {
  location: { id: LOC_TAPROOM.id, name: LOC_TAPROOM.name },
  backLabel: "Location detail",
  bins: [
    { ...TAPROOM_BINS[0], detail: "38 cases · 12 kegs" },
    { ...TAPROOM_BINS[1], detail: "22 cases" },
    { ...TAPROOM_BINS[2], detail: "6 cases" },
  ],
};

/** Cold bin sheet. */
export const binCold: BinSnapshot = {
  id: BIN_COLD,
  name: "Cold",
};
