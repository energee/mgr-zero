// lib/mgr/batches-view.ts — view-model for the Batches Work list: one structured
// row per batch (BatchesView draws the register from these fields) and one per vessel.
import type { EmptyState } from "./empty-state";
import { WORK_CHIPS, WORK_TABS } from "@/lib/mgr/work-view";
import { batNo } from "@/lib/mgr/doc-no";
import { formatLatestReading, type VesselReading } from "./vessel-detail-view";
import type { GravityUnit } from "./gravity-unit";
import { formatDate } from "@/lib/date-format";

/** One open occupancy of a brewed batch: the tank, its latest reading line, and where Reading goes. */
export type BatchOccupancyView = { key: string; vessel: string; reading: string; href?: string };

/** One batch. `brand` and `recipe` are null when the plan names none. `vessel`
 *  is the query's joined open-tank names. `readings` is set only for a brewed,
 *  unclosed batch; an empty list there means it has no open occupancy.
 *  `brewable` (not brewed, closed or cancelled) is what offers Brew; `href`
 *  opens the batch. */
export type BatchesRowView = {
  key: string;
  batchNo: string;
  brand: string | null;
  recipe: string | null;
  plannedOn: string;
  plannedBbl: number;
  vessel: string | null;
  brewable: boolean;
  readings?: BatchOccupancyView[];
  href?: string;
};

/** One vessel in the setup table; `href` opens its edit page. */
export type BatchVesselView = { key: string; name: string; kind: string; capacityBbl: number; active: boolean; href?: string };

export type BatchesViewModel = {
  title: string;
  planned: BatchesRowView[];
  active: BatchesRowView[];
  completed?: BatchesRowView[];
  cancelled?: BatchesRowView[];
  vessels?: BatchVesselView[];
  empty?: EmptyState;
  workChips: string[];
  workChipIndex: number;
  workTabs: Record<string, string>;
};

export type BatchesSnapshot = {
  title: string;
  planned?: BatchesRowView[];
  active?: BatchesRowView[];
  completed?: BatchesRowView[];
  cancelled?: BatchesRowView[];
  vessels?: BatchVesselView[];
  empty?: EmptyState;
};

export function toBatchesViewProps(s: BatchesSnapshot): BatchesViewModel {
  const planned = s.planned ?? [];
  const active = s.active ?? [];
  return {
    title: s.title,
    planned,
    active,
    completed: s.completed,
    cancelled: s.cancelled,
    vessels: s.vessels,
    empty: s.empty ?? ([planned, active, s.completed, s.cancelled].every(rows => !rows?.length) ? { title: "No batches yet", description: "Plan a batch to put a recipe on the brew schedule." } : undefined),
    workChips: WORK_CHIPS,
    workChipIndex: 3,
    workTabs: WORK_TABS,
  };
}

export type BatchListRow = { id: string; batch_no: number | null; planned_on: string; planned_bbl: number; brewed_on: string | null; closed_at: string | null; cancelled_at: string | null; brand_name: string | null; recipe_name: string | null; vessel_name: string | null; active_occupancies: { id: string; vessel_name: string; latest_reading?: VesselReading | null }[] };
export type BatchVessel = { id: string; name: string; kind: string; capacity_bbl: number; active: boolean };

export function batchesFromQuery(batches: BatchListRow[], vessels: BatchVessel[], hrefs?: { batch: (id: string) => string; vessel: (id: string) => string; reading?: (id: string) => string }, display: { unit: GravityUnit; timeZone: string } = { unit: "plato", timeZone: "UTC" }): BatchesSnapshot {
  const snapshot: BatchesSnapshot = { title: "Work", planned: [], active: [], completed: [], cancelled: [], vessels: vessels.map(vessel => ({ key: vessel.id, name: vessel.name, kind: vessel.kind, capacityBbl: Number(vessel.capacity_bbl), active: vessel.active, href: hrefs?.vessel(vessel.id) })) };
  for (const batch of batches) {
    const row: BatchesRowView = {
      key: batch.id, batchNo: batNo(batch.batch_no), brand: batch.brand_name, recipe: batch.recipe_name,
      plannedOn: formatDate(batch.planned_on), plannedBbl: Number(batch.planned_bbl), vessel: batch.vessel_name,
      brewable: !batch.brewed_on && !batch.closed_at && !batch.cancelled_at, href: hrefs?.batch(batch.id),
    };
    if (batch.brewed_on && !batch.closed_at) {
      row.readings = batch.active_occupancies.map(occupancy => ({
        key: occupancy.id, vessel: occupancy.vessel_name,
        reading: formatLatestReading(occupancy.latest_reading, display.unit, display.timeZone),
        href: hrefs?.reading?.(occupancy.id),
      }));
    }
    (batch.cancelled_at ? snapshot.cancelled : batch.closed_at ? snapshot.completed : batch.brewed_on ? snapshot.active : snapshot.planned)!.push(row);
  }
  return snapshot;
}
