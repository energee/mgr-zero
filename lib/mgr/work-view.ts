// lib/mgr/work-view.ts — view-model for the Work landing (list_work), and the
// Work chips every Work page draws: their identities, pages, and labels.
import type { WorkKind, WorkRow } from "@/lib/commands/landings";
import type { EmptyState } from "@/lib/mgr/empty-state";
import { STAFF_NAV } from "@/lib/mgr/nav";

/** The page each Work chip opens. A key is the chip's identity: "all" or a
 *  WorkKind, the value filters, hrefs and the remembered mgr-work-filter use. */
export const WORK_HREFS: Record<"all" | WorkKind, string> = {
  all: "/work", orders: "/orders", transfers: "/transfers", batches: "/batches",
  runs: "/packaging", POs: "/purchase-orders", routes: "/routes",
};
export const WORK_CHIPS = Object.keys(WORK_HREFS);

/** What each chip shows: "All", then the sidebar's name for the page the chip
 *  opens, so a tab never names its page differently from the sidebar (#1104).
 *  A chip whose page is not in the sidebar keeps its identity as a label; that
 *  is safe because workHrefsFor drops such a chip from every live page. */
const WORK_NAV = STAFF_NAV.find(item => item.href === "/work")?.children ?? [];
function chipLabel(chip: string, href: string): string {
  if (chip === "all") return "All";
  return WORK_NAV.find(item => item.href === href)?.label ?? chip;
}
export const WORK_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(WORK_HREFS).map(([chip, href]) => [chip, chipLabel(chip, href)]),
);

/** The inventory screen each chip opens (TabBar's `to`, the explorer's
 *  data-to and persona hiding). Not shown to anyone: WORK_LABELS is the text. */
export const WORK_TABS: Record<string, string> = {
  all: "Work", orders: "Orders", transfers: "Transfers", batches: "Batches",
  runs: "Packaging runs", POs: "Purchase orders", routes: "Routes",
};

/** What the Work list says when the chosen chip has no rows. It names no kind:
 *  list_work never returns transfers or packaging runs, and each role sees
 *  only some kinds, so a list of kinds would promise rows that never come. */
export const WORK_EMPTY = {
  title: "Nothing in motion",
  description: "A row appears here when something needs your next step.",
} satisfies EmptyState;

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
  rows: WorkRowView[];
  workChips: string[];
  workChipIndex: number;
  workTabs: Record<string, string>;
  defaults?: WorkKind[];
};

export type WorkSnapshot = { rows: WorkRowView[] };

export function toWorkViewProps({ rows }: WorkSnapshot): WorkViewModel {
  return { rows, workChips: WORK_CHIPS, workChipIndex: 0, workTabs: WORK_TABS };
}

export function workFromQuery(rows: WorkRow[], defaults: WorkKind[]): WorkViewModel {
  const icons: Record<WorkKind, NonNullable<WorkRowView["icon"]>> = { orders: "package", transfers: "package", batches: "thermometer", runs: "package", POs: "truck", routes: "route" };
  return { ...toWorkViewProps({ rows: rows.map(row => ({ key: `${row.kind}:${row.id}`, kind: row.kind, title: row.label, detail: row.detail, verb: row.verb, tone: row.tone, warning: row.tone === "attention", href: row.href, icon: icons[row.kind] })) }), defaults };
}

export function filterWorkRows(model: WorkViewModel, chip: string) {
  return model.rows.filter(row => chip === "all" ? !model.defaults || model.defaults.includes(row.kind) : row.kind === chip);
}
