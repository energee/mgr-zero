import { formatLatestReading, type VesselReading } from "./vessel-detail-view";
import type { GravityUnit } from "./gravity-unit";

export type CellarMapViewModel = {
  backHref?: string; addHref?: string; readingHref?: string | null; readingHint?: string; brewHref?: string;
  tiles: { name: string; detail: string; reading?: string; warning?: boolean; fill?: number; href?: string }[];
  detail?: { title: string; description: string; href?: string };
};

export function toCellarMapViewProps(vessels: { id: string; name: string; capacity_bbl: number }[], occupancies: { vessel_id: string; occupancy_id: string; brand_name: string | null; bbl: number }[], readings: Record<string, string> = {}, hrefs: Record<string, string> = {}, readingHref?: (occupancyId: string) => string): CellarMapViewModel {
  // The map draws one Reading button, so it can only be bound when a single
  // tank is occupied; with several there is no unambiguous target and guessing
  // records the reading against the wrong one, so the tile opens the tank
  // instead. The caller supplies the path — this never invents one.
  // A disabled Reading also says why (#715), so the brewer is pointed at the
  // tank tiles rather than left at a dead end.
  const only = occupancies.length === 1 ? occupancies[0] : undefined;
  const readingHint = !readingHref || only ? undefined
    : occupancies.length ? "Several tanks hold beer. Open a tank to record its reading."
    : "No tank holds beer, so there is nothing to read.";
  return { readingHref: readingHref && (only ? readingHref(only.occupancy_id) : null), readingHint, tiles: vessels.map(vessel => {
    const occupancy = occupancies.find(item => item.vessel_id === vessel.id);
    const quantity = occupancy ? Number(occupancy.bbl) : 0;
    const capacity = Number(vessel.capacity_bbl);
    return { name: vessel.name, detail: `${occupancy ? occupancy.brand_name ?? "No brand yet" : "Empty"} · ${quantity} / ${capacity} bbl`, reading: occupancy ? readings[occupancy.occupancy_id] ?? "No readings yet" : "available", fill: capacity > 0 ? quantity / capacity * 100 : undefined, href: hrefs[vessel.id] };
  }) };
}

// Each open occupancy's latest reading, keyed by occupancy id, from one
// list_batches({ readings: true }) read — the batch list already embeds the
// newest reading per open occupancy, so the cellar map never asks per tank (#700).
export function cellarReadings(batches: { active_occupancies: { id: string; latest_reading?: VesselReading | null }[] }[], unit: GravityUnit, timeZone: string): Record<string, string> {
  return Object.fromEntries(batches.flatMap(batch => batch.active_occupancies)
    .map(occupancy => [occupancy.id, formatLatestReading(occupancy.latest_reading, unit, timeZone)]));
}
