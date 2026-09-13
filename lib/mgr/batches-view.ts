// lib/mgr/batches-view.ts — view-model for the Batches Work list.
import { WORK_CHIPS, WORK_TABS } from "@/lib/mgr/work-view";
import { batNo } from "@/lib/mgr/doc-no";

export type BatchesRowView = {
  key: string;
  title: string;
  detail: string;
  verb: string;
  tone: "info" | "attention" | "success" | "primary";
  warning?: boolean;
  href?: string;
};

export type BatchesViewModel = {
  title: string;
  subtitle: string;
  planned: BatchesRowView[];
  active: BatchesRowView[];
  completed?: BatchesRowView[];
  vessels?: BatchesRowView[];
  readingUnavailable?: boolean;
  empty?: string;
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
  vessels?: BatchesRowView[];
  readingUnavailable?: boolean;
  empty?: string;
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
    vessels: s.vessels,
    readingUnavailable: s.readingUnavailable,
    empty: s.empty ?? (planned.length === 0 && active.length === 0 && !s.completed?.length ? "No batches yet" : undefined),
    workChips: WORK_CHIPS,
    workChipIndex: 3,
    workTabs: WORK_TABS,
  };
}

export type BatchListRow = { id: string; batch_no: number | null; planned_on: string; planned_bbl: number; brewed_on: string | null; closed_at: string | null; brand_name: string | null; recipe_name: string | null; vessel_name: string | null };
export type BatchVessel = { id: string; name: string; kind: string; capacity_bbl: number; active: boolean };

export function batchesFromQuery(batches: BatchListRow[], vessels: BatchVessel[], hrefs?: { batch: (id: string) => string; vessel: (id: string) => string }): BatchesSnapshot {
  const snapshot: BatchesSnapshot = { title: "Work", subtitle: "brewed and planned", planned: [], active: [], completed: [], readingUnavailable: batches.some(batch => batch.brewed_on && !batch.closed_at), vessels: vessels.map(vessel => ({ key: vessel.id, title: vessel.name, detail: `${vessel.kind} · ${Number(vessel.capacity_bbl)} bbl${vessel.active ? "" : " · inactive"}`, verb: "Edit", tone: "info", href: hrefs?.vessel(vessel.id) })) };
  for (const batch of batches) {
    const row: BatchesRowView = { key: batch.id, title: batNo(batch.batch_no), detail: `${batch.brand_name ?? "no brand yet"} · ${batch.recipe_name ?? "no recipe"} · ${Number(batch.planned_bbl)} bbl · ${batch.planned_on}${batch.vessel_name ? ` · ${batch.vessel_name}` : ""}`, verb: batch.brewed_on || batch.closed_at ? "Open" : "Brew", tone: batch.brewed_on || batch.closed_at ? "primary" : "info", href: hrefs?.batch(batch.id) };
    (batch.closed_at ? snapshot.completed : batch.brewed_on ? snapshot.active : snapshot.planned)!.push(row);
  }
  return snapshot;
}
