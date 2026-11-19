import type { VesselReading } from "./vessel-detail-view";
import { currentFigures, type RecentGravity } from "./batches-view";
import { breweryDate } from "@/lib/date-format";

/** The cookie holding the Cellar's saved Tiles / Rows choice: CellarLayout writes it, the Cellar page reads it. */
export const CELLAR_LAYOUT_COOKIE = "cellar_layout";

export type CellarMapViewModel = {
  /** addHref null hides Add vessel (vessels are admin-managed). actionsOff: no
   *  tank holds beer, so Reading, Transfer and Addition are all off; the page
   *  hands the same flag to the live Transfer and Addition forms. actionHint
   *  says why an action is off. readingHref is where the day's reading round
   *  starts: the first tank, in tile order, with no reading today, or the
   *  first tank when all have one. It is null when no tank holds beer.
   *  A tile's `group` is its vessel-type heading. An empty tank has no volume,
   *  reading, fill or day, and its detail is its capacity: the view lists it on
   *  its group's Empty line, not as a tile. `day` is the days the beer has been
   *  in this tank ("Day 14"). `readToday` says the tank's newest reading was
   *  taken today. A tile's readingHref is set only when it holds beer; it
   *  draws an Add reading button beside the reading line. The inventory gives
   *  "" to draw the button inert. `layout` is the saved Tiles / Rows choice;
   *  none draws Tiles. */
  layout?: "Tiles" | "Rows"; backHref?: string; addHref?: string | null; readingHref?: string | null; actionsOff?: boolean; actionHint?: string; brewHref?: string;
  tiles: { name: string; group: string; detail: string; day?: string; volume?: string; reading?: string; readToday?: boolean; warning?: boolean; fill?: number; href?: string; readingHref?: string }[];
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

/** Whole calendar days from `startedAt` to `now`, both read as days in `timeZone`: beer knocked out yesterday afternoon is on day 1 this morning. */
function daysInTank(startedAt: string, timeZone: string, now: Date): number {
  const day = (at: Date) => Date.parse(breweryDate(timeZone, at));
  return Math.round((day(now) - day(new Date(startedAt))) / 86_400_000);
}

/** One tank's newest reading for the map: the line its tile shows, and when it was taken. */
type CellarReading = { text: string; at: string };

/** `timeZone` is the brewery's: with it each occupied tile says its days in the tank and whether it was read today; without it no tile does. */
export function toCellarMapViewProps(vessels: (OrderedVessel & { capacity_bbl: number })[], occupancies: { vessel_id: string; occupancy_id: string; brand_name: string | null; started_at: string; bbl: number }[], readings: Record<string, CellarReading> = {}, hrefs: Record<string, string> = {}, readingHref?: (occupancyId: string) => string, timeZone?: string, now: Date = new Date()): CellarMapViewModel {
  // The map's top Reading button starts the day's round at the first tank not
  // read today; the sheet names its tank, and Save and next tank walks the
  // rest in tile order (#1508). The caller supplies the path — this never
  // invents one.
  // With no beer in any tank, Reading, Transfer and Addition are all off
  // (actionsOff), and the one hint says why, so none is a silent dead end
  // (#715, #1115).
  const today = timeZone === undefined ? undefined : breweryDate(timeZone, now);
  const actionsOff = occupancies.length === 0;
  const actionHint = actionsOff ? "No tank holds beer, so there is nothing to read, transfer or add to." : undefined;
  const tiles = cellarOrder(vessels).map(vessel => {
    const occupancy = tileOccupancy(vessel, occupancies);
    const capacity = Number(vessel.capacity_bbl);
    const tile = { name: vessel.name, group: KIND_GROUPS[vessel.kind], href: hrefs[vessel.id] };
    if (!occupancy) return { ...tile, detail: `${capacity} bbl` };
    const quantity = Number(occupancy.bbl);
    const latest = readings[occupancy.occupancy_id];
    return {
      ...tile, detail: occupancy.brand_name ?? "No brand yet", day: timeZone === undefined ? undefined : `Day ${daysInTank(occupancy.started_at, timeZone, now)}`, volume: `${quantity} / ${capacity} bbl`,
      reading: latest?.text ?? "No readings yet", readToday: timeZone !== undefined && latest !== undefined && breweryDate(timeZone, new Date(latest.at)) === today,
      fill: capacity > 0 ? quantity / capacity * 100 : undefined, readingHref: readingHref?.(occupancy.occupancy_id),
    };
  });
  const occupied = tiles.filter(tile => "volume" in tile);
  const roundStart = occupied.find(tile => !tile.readToday) ?? occupied[0];
  return { readingHref: readingHref && (roundStart?.readingHref ?? null), actionsOff, actionHint, tiles };
}

// Each open occupancy's latest reading, keyed by occupancy id, from one
// list_batches({ readings: true }) read — the batch list already embeds the
// newest reading per open occupancy, so the cellar map never asks per tank (#700).
// A tank with no reading has no entry: the map says "No readings yet" there.
// A tile is narrow, so it says only the beer's ABV so far ("5.4% ABV"), from
// the same figures Batches shows; the reading itself, its age and Fermenting or
// Finished are on Batches and Vessel detail. A tank whose only gravity is the
// OG says "No ABV yet".
type CellarBatch = { og_reading?: { id: string; gravity_plato: number } | null; active_occupancies: { id: string; latest_reading?: VesselReading | null; recent_gravity?: RecentGravity[] }[] };
export function cellarReadings(batches: CellarBatch[]): Record<string, CellarReading> {
  return Object.fromEntries(batches.flatMap(batch => batch.active_occupancies.flatMap(({ id, latest_reading, recent_gravity }) => {
    if (!latest_reading) return [];
    const { abv } = currentFigures(batch.og_reading, recent_gravity?.[0]);
    return [[id, { text: abv ? `${abv} ABV` : "No ABV yet", at: latest_reading.at }]];
  })));
}
