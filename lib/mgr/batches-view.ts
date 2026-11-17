// lib/mgr/batches-view.ts — view-model for the Batches Work list: one structured
// row per batch (BatchesView draws the register from these fields) and one per vessel.
import type { EmptyState } from "./empty-state";
import { WORK_CHIPS, WORK_TABS } from "@/lib/mgr/work-view";
import { batNo } from "@/lib/mgr/doc-no";
import { sentenceCase } from "@/lib/mgr/labels";
import { formatLatestReading, type VesselReading } from "./vessel-detail-view";
import type { GravityUnit } from "./gravity-unit";
import { formatDate } from "@/lib/date-format";
import { CHANGE_PLAN_ID } from "./brew-prep-view";
import { measuredGravity } from "@/lib/recipe-gravity";
import { wholePercent } from "./recipe-view";

/** One open occupancy of a brewed batch: the tank, its latest reading line, and where Reading goes.
 *  `abv` and `attenuation` are where the beer in this tank stands now, from the batch's first
 *  gravity reading to this tank's latest; absent until a second gravity reading. */
export type BatchOccupancyView = { key: string; vessel: string; reading: string; abv?: string; attenuation?: string; href?: string };

/** One batch. `brand` and `recipe` are null when the plan names none. `vessel`
 *  is the query's joined open-tank names. `readings` is set only for a brewed,
 *  unclosed batch; an empty list there means it has no open occupancy.
 *  `abv` and `attenuation` are set only for a completed batch: its final figures,
 *  from its first gravity reading to its last, each "" when it has no second one.
 *  `overdue` marks a planned batch dated before the brewery's day. `href`
 *  opens the batch; an overdue one lands on its open Reschedule or cancel
 *  fold, so a stale plan is cleared from there (#1582). */
export type BatchesRowView = {
  key: string;
  batchNo: string;
  brand: string | null;
  recipe: string | null;
  plannedOn: string;
  plannedBbl: number;
  vessel: string | null;
  readings?: BatchOccupancyView[];
  abv?: string;
  attenuation?: string;
  overdue?: boolean;
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
    empty: s.empty ?? ([planned, active, s.completed, s.cancelled].every(rows => !rows?.length) ? { title: "No batches yet" } : undefined),
    workChips: WORK_CHIPS,
    workChipIndex: 3,
    workTabs: WORK_TABS,
  };
}

type GravityReading = { id: string; gravity_plato: number };
export type BatchListRow = { id: string; batch_no: number | null; planned_on: string; planned_bbl: number; brewed_on: string | null; closed_at: string | null; cancelled_at: string | null; brand_name: string | null; recipe_name: string | null; vessel_name: string | null; og_reading?: GravityReading | null; fg_reading?: GravityReading | null; active_occupancies: { id: string; vessel_name: string; latest_reading?: VesselReading | null }[] };
export type BatchVessel = { id: string; name: string; kind: string; capacity_bbl: number; active: boolean };

/** ABV and apparent attenuation from the batch's first gravity reading, the OG, to `latest`: a tank's latest reading
 *  for the figures so far, or a completed batch's last gravity reading for the final ones. Nothing when the latest
 *  reading is the OG itself or has no gravity.
 *  ponytail: reads only the tank's newest reading, so a temperature-only check blanks the figures until the next
 *  gravity; have list_batches return the newest gravity reading if that turns out to matter. */
function currentFigures(og: BatchListRow["og_reading"], latest: { id: string; gravity_plato: number | null } | null | undefined): { abv?: string; attenuation?: string } {
  if (!og || !latest || latest.gravity_plato === null || latest.id === og.id) return {};
  const { abv, apparentAttenuation } = measuredGravity({ ogPlato: og.gravity_plato, fgPlato: latest.gravity_plato, potentialPointsPerBbl: null, plannedBbl: 0, knockoutBbl: null });
  return { ...(abv !== null && { abv: `${abv.toFixed(1)}%` }), ...(apparentAttenuation !== null && { attenuation: wholePercent(apparentAttenuation) }) };
}

/** `display.today` is the brewery's day (YYYY-MM-DD); without it no batch is marked overdue. */
export function batchesFromQuery(batches: BatchListRow[], vessels: BatchVessel[], hrefs?: { batch: (id: string) => string; vessel: (id: string) => string; reading?: (id: string) => string }, display: { unit: GravityUnit; timeZone: string; today?: string } = { unit: "plato", timeZone: "UTC" }): BatchesSnapshot {
  const snapshot: BatchesSnapshot = { title: "Batches", planned: [], active: [], completed: [], cancelled: [], vessels: vessels.map(vessel => ({ key: vessel.id, name: vessel.name, kind: sentenceCase(vessel.kind), capacityBbl: Number(vessel.capacity_bbl), active: vessel.active, href: hrefs?.vessel(vessel.id) })) };
  for (const batch of batches) {
    const group = (batch.cancelled_at ? snapshot.cancelled : batch.closed_at ? snapshot.completed : batch.brewed_on ? snapshot.active : snapshot.planned)!;
    const overdue = group === snapshot.planned && !!display.today && batch.planned_on < display.today;
    const href = hrefs?.batch(batch.id);
    const row: BatchesRowView = {
      key: batch.id, batchNo: batNo(batch.batch_no), brand: batch.brand_name, recipe: batch.recipe_name,
      plannedOn: formatDate(batch.planned_on), plannedBbl: Number(batch.planned_bbl), vessel: batch.vessel_name,
      overdue: overdue || undefined, href: href && overdue ? `${href}#${CHANGE_PLAN_ID}` : href,
    };
    if (batch.brewed_on && !batch.closed_at) {
      row.readings = batch.active_occupancies.map(occupancy => ({
        key: occupancy.id, vessel: occupancy.vessel_name,
        reading: formatLatestReading(occupancy.latest_reading, display.unit, display.timeZone),
        ...currentFigures(batch.og_reading, occupancy.latest_reading),
        href: hrefs?.reading?.(occupancy.id),
      }));
    }
    if (group === snapshot.completed) {
      // Both are always set, "" when there is no figure, so the Completed table draws the same columns as Active.
      const final = currentFigures(batch.og_reading, batch.fg_reading);
      row.abv = final.abv ?? "";
      row.attenuation = final.attenuation ?? "";
    }
    group.push(row);
  }
  return snapshot;
}
