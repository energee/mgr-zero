import { formatLatestReading, type VesselReading } from "./vessel-detail-view";
import type { GravityUnit } from "./gravity-unit";

export type CellarMapViewModel = {
  /** addHref null hides Add vessel (vessels are admin-managed). actionsOff: no
   *  tank holds beer, so Reading, Transfer and Addition are all off; the page
   *  hands the same flag to the live Transfer and Addition forms. actionHint
   *  says why an action is off. A tile's readingHref is set only when it holds beer;
   *  the inventory gives "" to draw that Reading unlinked. */
  backHref?: string; addHref?: string | null; readingHref?: string | null; actionsOff?: boolean; actionHint?: string; brewHref?: string;
  tiles: { name: string; detail: string; reading?: string; warning?: boolean; fill?: number; href?: string; readingHref?: string }[];
  detail?: { title: string; description: string; href?: string };
};

type TileOccupancy = { vessel_id: string; occupancy_id: string };

/** The occupancy a vessel's tile shows: the first open one in that vessel. */
const tileOccupancy = <T extends TileOccupancy>(vessel: { id: string }, occupancies: T[]) => occupancies.find(item => item.vessel_id === vessel.id);

/** The occupancy of the next occupied tile after `occupancyId`'s, in the map's tile order (the vessel list), so a
 *  reading round walks the tanks as the map draws them (#1508); null after the last occupied tile or for an unknown one. */
export function nextTankOccupancy(vessels: { id: string }[], occupancies: TileOccupancy[], occupancyId: string): string | null {
  const order = vessels.flatMap(vessel => tileOccupancy(vessel, occupancies)?.occupancy_id ?? []);
  const at = order.indexOf(occupancyId);
  return at === -1 ? null : order[at + 1] ?? null;
}

export function toCellarMapViewProps(vessels: { id: string; name: string; capacity_bbl: number }[], occupancies: { vessel_id: string; occupancy_id: string; brand_name: string | null; bbl: number }[], readings: Record<string, string> = {}, hrefs: Record<string, string> = {}, readingHref?: (occupancyId: string) => string): CellarMapViewModel {
  // The map's top Reading button can only be bound when a single tank is
  // occupied; with several there is no unambiguous target and guessing records
  // the reading against the wrong one, so each occupied tile carries its own
  // Reading instead (#1508). The caller supplies the path — this never invents
  // one. A disabled Reading carries a hint saying why, so it is never a silent
  // dead end (#715).
  // With no beer in any tank, Transfer and Addition are off too (actionsOff),
  // so the one hint names all three (#1115).
  const only = occupancies.length === 1 ? occupancies[0] : undefined;
  const actionsOff = occupancies.length === 0;
  let actionHint: string | undefined;
  if (actionsOff) actionHint = "No tank holds beer, so there is nothing to read, transfer or add to.";
  else if (readingHref && occupancies.length > 1) actionHint = "Several tanks hold beer. Use Reading on a tank.";
  return { readingHref: readingHref && (only ? readingHref(only.occupancy_id) : null), actionsOff, actionHint, tiles: vessels.map(vessel => {
    const occupancy = tileOccupancy(vessel, occupancies);
    const quantity = occupancy ? Number(occupancy.bbl) : 0;
    const capacity = Number(vessel.capacity_bbl);
    return { name: vessel.name, detail: `${occupancy ? occupancy.brand_name ?? "No brand yet" : "Empty"} · ${quantity} / ${capacity} bbl`, reading: occupancy ? readings[occupancy.occupancy_id] ?? "No readings yet" : "available", fill: capacity > 0 ? quantity / capacity * 100 : undefined, href: hrefs[vessel.id], readingHref: occupancy && readingHref?.(occupancy.occupancy_id) };
  }) };
}

// Each open occupancy's latest reading, keyed by occupancy id, from one
// list_batches({ readings: true }) read — the batch list already embeds the
// newest reading per open occupancy, so the cellar map never asks per tank (#700).
export function cellarReadings(batches: { active_occupancies: { id: string; latest_reading?: VesselReading | null }[] }[], unit: GravityUnit, timeZone: string): Record<string, string> {
  return Object.fromEntries(batches.flatMap(batch => batch.active_occupancies)
    .map(occupancy => [occupancy.id, formatLatestReading(occupancy.latest_reading, unit, timeZone)]));
}
