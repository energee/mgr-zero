// lib/mgr/work-view.ts — view-model for the Work landing (list_work).
import type { WorkKind, WorkRow } from "@/lib/commands/landings";
export const WORK_CHIPS = ["all", "orders", "transfers", "batches", "runs", "POs", "routes"];
export const WORK_TABS: Record<string, string> = {
  all: "Work", orders: "Orders", transfers: "Transfers", batches: "Batches",
  runs: "Packaging runs", POs: "Purchase orders", routes: "Routes",
};

export type WorkRowView = {
  key: string;
  kind: WorkKind;
  title: string;
  detail: string;
  verb: string;
  tone: "info" | "attention" | "success";
  warning?: boolean;
  href?: string;
  icon?: "package" | "truck" | "route" | "thermometer";
};

export type WorkViewModel = {
  subtitle: string;
  rows: WorkRowView[];
  workChips: string[];
  workChipIndex: number;
  workTabs: Record<string, string>;
  defaults?: WorkKind[];
};

export type WorkSnapshot = { subtitle: string; rows: WorkRowView[] };

export function toWorkViewProps({ subtitle, rows }: WorkSnapshot): WorkViewModel {
  return { subtitle, rows, workChips: WORK_CHIPS, workChipIndex: 0, workTabs: WORK_TABS };
}

export function workFromQuery(rows: WorkRow[], subtitle: string, defaults: WorkKind[]): WorkViewModel {
  const icons: Record<WorkKind, NonNullable<WorkRowView["icon"]>> = { orders: "package", transfers: "package", batches: "thermometer", runs: "package", POs: "truck", routes: "route" };
  return { ...toWorkViewProps({ subtitle, rows: rows.map(row => ({ key: `${row.kind}:${row.id}`, kind: row.kind, title: row.label, detail: row.detail, verb: row.verb, tone: row.tone, warning: row.tone === "attention", href: row.href, icon: icons[row.kind] })) }), defaults };
}

export function filterWorkRows(model: WorkViewModel, chip: string) {
  return model.rows.filter(row => chip === "all" ? !model.defaults || model.defaults.includes(row.kind) : row.kind === chip);
}
