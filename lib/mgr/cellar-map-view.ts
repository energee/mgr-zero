import { formatVesselReading, type VesselReading } from "./vessel-detail-view";
import { formatAgo } from "@/lib/date-format";
import type { GravityUnit } from "./gravity-unit";

export type CellarMapViewModel = {
  /** addHref null hides Add vessel (vessels are admin-managed). actionsOff: no
   *  tank holds beer, so Reading, Transfer and Addition are all off; the page
   *  hands the same flag to the live Transfer and Addition forms. actionHint
   *  says why an action is off. readingHref null with beer in several tanks
   *  hides the top Reading: each tile's reading line opens it instead.
   *  A tile's `group` is its vessel-type heading. An empty tank has no volume,
   *  reading or fill. A tile's readingHref is set only when it holds beer; it
   *  makes the reading line a link, or with no reading yet draws an Add
   *  reading button. The inventory gives "" to draw either inert. */
  backHref?: string; addHref?: string | null; readingHref?: string | null; actionsOff?: boolean; actionHint?: string; brewHref?: string;
  tiles: { name: string; group: string; detail: string; volume?: string; reading?: string; readAgo?: string; warning?: boolean; fill?: number; href?: string; readingHref?: string }[];
  detail?: { title: string; description: string; href?: string };
};

type TileOccupancy = { vessel_id: string; occupancy_id: string };

/** Each vessel kind's heading on the map. The key order is the order the groups are drawn in. */
const KIND_GROUPS = { fermenter: "Fermenters", brite: "Brite tanks", barrel: "Barrels", kettle: "Kettles", other: "Other" };
/** The vessel facts the map orders by: list_vessels rows carry them. */
export type OrderedVessel = { id: string; name: string; kind: keyof typeof KIND_GROUPS };
const KINDS = Object.keys(KIND_GROUPS);

/** Vessels in map order: grouped by kind, then by name with numbers counted, so FV2 comes before FV10. */
const cellarOrder = <T extends OrderedVessel>(vessels: T[]) =>
  [...vessels].sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.name.localeCompare(b.name, undefined, { numeric: true }));

/** The occupancy a vessel's tile shows: the first open one in that vessel. */
const tileOccupancy = <T extends TileOccupancy>(vessel: { id: string }, occupancies: T[]) => occupancies.find(item => item.vessel_id === vessel.id);

/** The occupancy of the next occupied tile after `occupancyId`'s, in the map's tile order (cellarOrder), so a
 *  reading round walks the tanks as the map draws them (#1508); null after the last occupied tile or for an unknown one. */
export function nextTankOccupancy(vessels: OrderedVessel[], occupancies: TileOccupancy[], occupancyId: string): string | null {
  const order = cellarOrder(vessels).flatMap(vessel => tileOccupancy(vessel, occupancies)?.occupancy_id ?? []);
  const at = order.indexOf(occupancyId);
  return at === -1 ? null : order[at + 1] ?? null;
}

export function toCellarMapViewProps(vessels: (OrderedVessel & { capacity_bbl: number })[], occupancies: { vessel_id: string; occupancy_id: string; brand_name: string | null; bbl: number }[], readings: Record<string, CellarReading> = {}, hrefs: Record<string, string> = {}, readingHref?: (occupancyId: string) => string): CellarMapViewModel {
  // The map's top Reading button can only be bound when a single tank is
  // occupied; with several there is no unambiguous target and guessing records
  // the reading against the wrong one, so the view hides it and each occupied
  // tile's reading line opens Reading instead (#1508). The caller supplies the
  // path — this never invents one.
  // With no beer in any tank, Reading, Transfer and Addition are all off
  // (actionsOff), and the one hint says why, so none is a silent dead end
  // (#715, #1115).
  const only = occupancies.length === 1 ? occupancies[0] : undefined;
  const actionsOff = occupancies.length === 0;
  const actionHint = actionsOff ? "No tank holds beer, so there is nothing to read, transfer or add to." : undefined;
  return { readingHref: readingHref && (only ? readingHref(only.occupancy_id) : null), actionsOff, actionHint, tiles: cellarOrder(vessels).map(vessel => {
    const occupancy = tileOccupancy(vessel, occupancies);
    const capacity = Number(vessel.capacity_bbl);
    const tile = { name: vessel.name, group: KIND_GROUPS[vessel.kind], href: hrefs[vessel.id] };
    if (!occupancy) return { ...tile, detail: `Empty · ${capacity} bbl` };
    const quantity = Number(occupancy.bbl);
    const link = readingHref?.(occupancy.occupancy_id);
    const latest = readings[occupancy.occupancy_id];
    // A linked tile with no reading has no reading line: the view draws Add reading there.
    return { ...tile, detail: occupancy.brand_name ?? "No brand yet", volume: `${quantity} / ${capacity} bbl`, reading: latest?.values ?? (link === undefined ? "No readings yet" : undefined), readAgo: latest?.ago, fill: capacity > 0 ? quantity / capacity * 100 : undefined, readingHref: link };
  }) };
}

// Each open occupancy's latest reading, keyed by occupancy id, from one
// list_batches({ readings: true }) read — the batch list already embeds the
// newest reading per open occupancy, so the cellar map never asks per tank (#700).
// A tank with no reading has no entry: the map words that line itself.
// A tile is narrow, so it reads the values and their age ("1d ago"), not a
// full date and time; the note is left out, as Vessel detail shows it.
export type CellarReading = { values: string; ago: string };
export function cellarReadings(batches: { active_occupancies: { id: string; latest_reading?: VesselReading | null }[] }[], unit: GravityUnit, now: Date = new Date()): Record<string, CellarReading> {
  return Object.fromEntries(batches.flatMap(batch => batch.active_occupancies).flatMap(({ id, latest_reading: reading }) => reading
    ? [[id, { values: formatVesselReading({ ...reading, note: null }, unit), ago: formatAgo(reading.at, now) }]] : []));
}
