// lib/mgr/batches-view.ts — view-model for the Batches Work list.
import type { EmptyState } from "./empty-state";
import { WORK_CHIPS, WORK_TABS } from "@/lib/mgr/work-view";
import { batNo } from "@/lib/mgr/doc-no";
import { formatVesselReading, type VesselReading } from "./vessel-detail-view";
import type { GravityUnit } from "./gravity-unit";
import { formatDate, formatDateTime } from "@/lib/date-format";

export type BatchesRowView = {
  key: string;
  title: string;
  detail: string;
  verb: string;
  tone: "info" | "attention" | "success" | "primary";
  readings?: { key: string; title: string; detail: string; href?: string }[];
  warning?: boolean;
  href?: string;
};

export type BatchesViewModel = {
  title: string;
  subtitle: string;
  planned: BatchesRowView[];
  active: BatchesRowView[];
  completed?: BatchesRowView[];
  cancelled?: BatchesRowView[];
  vessels?: BatchesRowView[];
  empty?: EmptyState;
  workChips: string[];
  workChipIndex: number;
  workTabs: Record<string, string>;
};

export type BatchesSnapshot = {
  title: string;
  subtitle: string;
  planned?: BatchesRowView[];
  active?: BatchesRowView[];
  completed?: BatchesRowView[];
  cancelled?: BatchesRowView[];
  vessels?: BatchesRowView[];
  empty?: EmptyState;
};

export function toBatchesViewProps(s: BatchesSnapshot): BatchesViewModel {
  const planned = s.planned ?? [];
  const active = s.active ?? [];
  return {
    title: s.title,
    subtitle: s.subtitle,
    planned,
    active,
    completed: s.completed,
    cancelled: s.cancelled,
    vessels: s.vessels,
    empty: s.empty ?? (planned.length === 0 && active.length === 0 && !s.completed?.length && !s.cancelled?.length ? { title: "No batches yet", description: "Plan a batch to put a recipe on the brew schedule." } : undefined),
    workChips: WORK_CHIPS,
    workChipIndex: 3,
    workTabs: WORK_TABS,
  };
}

export type BatchListRow = { id: string; batch_no: number | null; planned_on: string; planned_bbl: number; brewed_on: string | null; closed_at: string | null; cancelled_at?: string | null; brand_name: string | null; recipe_name: string | null; vessel_name: string | null; active_occupancies?: { id: string; vessel_name: string; latest_reading: VesselReading | null }[] };
export type BatchVessel = { id: string; name: string; kind: string; capacity_bbl: number; active: boolean };

export function batchesFromQuery(batches: BatchListRow[], vessels: BatchVessel[], hrefs?: { batch: (id: string) => string; vessel: (id: string) => string; reading?: (id: string) => string }, display: { unit: GravityUnit; timeZone: string } = { unit: "plato", timeZone: "UTC" }): BatchesSnapshot {
  const snapshot: BatchesSnapshot = { title: "Work", subtitle: "brewed and planned", planned: [], active: [], completed: [], cancelled: [], vessels: vessels.map(vessel => ({ key: vessel.id, title: vessel.name, detail: `${vessel.kind} · ${Number(vessel.capacity_bbl)} bbl${vessel.active ? "" : " · inactive"}`, verb: "Edit", tone: "info", href: hrefs?.vessel(vessel.id) })) };
  for (const batch of batches) {
    const row: BatchesRowView = { key: batch.id, title: batNo(batch.batch_no), detail: `${batch.brand_name ?? "no brand yet"} · ${batch.recipe_name ?? "no recipe"} · ${Number(batch.planned_bbl)} bbl · ${formatDate(batch.planned_on)}${batch.vessel_name ? ` · ${batch.vessel_name}` : ""}`, verb: batch.brewed_on || batch.closed_at || batch.cancelled_at ? "Open" : "Brew", tone: batch.brewed_on || batch.closed_at || batch.cancelled_at ? "primary" : "info", href: hrefs?.batch(batch.id) };
    if (batch.brewed_on && !batch.closed_at && !batch.cancelled_at) {
      row.readings = (batch.active_occupancies ?? []).map(occupancy => ({
        key: occupancy.id, title: occupancy.vessel_name,
        detail: occupancy.latest_reading ? `${formatVesselReading(occupancy.latest_reading, display.unit)} · ${formatDateTime(occupancy.latest_reading.at, display.timeZone)}` : "No readings yet",
        href: hrefs?.reading?.(occupancy.id),
      }));
      if (!row.readings.length) row.detail += " · No open occupancy";
    }
    (batch.cancelled_at ? snapshot.cancelled : batch.closed_at ? snapshot.completed : batch.brewed_on ? snapshot.active : snapshot.planned)!.push(row);
  }
  return snapshot;
}
