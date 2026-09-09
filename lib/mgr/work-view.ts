// lib/mgr/work-view.ts — view-model for the Work landing (list_work).
export const WORK_CHIPS = ["all", "orders", "transfers", "batches", "runs", "POs", "routes"];
export const WORK_TABS: Record<string, string> = {
  all: "Work", orders: "Orders", transfers: "Transfers", batches: "Batches",
  runs: "Packaging runs", POs: "Purchase orders", routes: "Routes",
};

export type WorkRowView = {
  key: string;
  title: string;
  detail: string;
  verb: string;
  tone: "info" | "attention" | "success";
  warning?: boolean;
  href?: string;
  icon?: "package" | "truck" | "route";
};

export type WorkViewModel = {
  subtitle: string;
  rows: WorkRowView[];
  workChips: string[];
  workChipIndex: number;
  workTabs: Record<string, string>;
};

export type WorkSnapshot = { subtitle: string; rows: WorkRowView[] };

export function toWorkViewProps({ subtitle, rows }: WorkSnapshot): WorkViewModel {
  return { subtitle, rows, workChips: WORK_CHIPS, workChipIndex: 0, workTabs: WORK_TABS };
}
