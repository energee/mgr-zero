import { breweryDate, formatDate } from "@/lib/date-format";
import { runNo } from "@/lib/mgr/doc-no";
import type { EmptyState } from "@/lib/mgr/empty-state";
import { WORK_CHIPS, WORK_TABS } from "@/lib/mgr/work-view";

export type PackagingRunSnapshot = {
  id: string;
  run_no: number;
  planned_on: string;
  started_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  brand_name: string | null;
  vessel_name: string | null;
  qty_planned: number;
  planned_unit?: string;
  material_shortfall?: string;
  lot_code?: string;
  output_summary?: string;
  yield_percent?: number;
  loss_bbl?: number;
};

export type PackagingRunRowView = {
  key: string;
  runNo: string;
  brand: string | null;
  date: string;
  source: string | null;
  quantity: string;
  status?: "Closed" | "Cancelled";
  overdue?: boolean;
  shortfall?: string;
  lot?: string;
  output?: string;
  yieldPercent?: number;
  lossBbl?: number;
  verb?: string;
  tone?: "info" | "attention";
  href?: string;
};

export type PackagingRunsViewModel = {
  upcoming: PackagingRunRowView[];
  recent: PackagingRunRowView[];
  /** Set only when there are no runs at all. */
  empty?: EmptyState;
  workChips: string[];
  workTabs: Record<string, string>;
};

function row(run: PackagingRunSnapshot, timeZone: string, today: string, href?: string): PackagingRunRowView {
  const common = {
    key: run.id,
    runNo: runNo(run.run_no),
    brand: run.brand_name,
    source: run.vessel_name,
    quantity: [run.qty_planned, run.planned_unit].filter(value => value !== undefined).join(" "),
    href,
  };
  // Finished runs open their record without suggesting they can be reopened.
  if (run.cancelled_at) return { ...common, status: "Cancelled", date: formatDate(run.cancelled_at, timeZone) };
  if (run.closed_at) return {
    ...common,
    status: "Closed",
    date: formatDate(run.closed_at, timeZone),
    lot: run.lot_code,
    output: run.output_summary,
    yieldPercent: run.yield_percent,
    lossBbl: run.loss_bbl,
  };
  const verb = run.material_shortfall ? "Resolve" : run.started_at ? "Close" : run.vessel_name ? "Start" : "Pick source";
  return {
    ...common,
    date: formatDate(run.planned_on),
    overdue: !run.started_at && run.planned_on < today,
    shortfall: run.material_shortfall,
    verb,
    tone: run.material_shortfall || run.started_at ? "attention" : "info",
  };
}

/** `timeZone` is breweries.timezone: a closed run is dated by the brewery's day, not closed_at's UTC prefix (#442). */
/** A closed or cancelled run is history; everything else is still upcoming. */
const finished = (run: PackagingRunSnapshot) => !!(run.closed_at || run.cancelled_at);

export function toPackagingRunsViewProps(runs: PackagingRunSnapshot[], timeZone: string, hrefFor?: (id: string) => string, at: Date = new Date()): PackagingRunsViewModel {
  const today = breweryDate(timeZone, at);
  return {
    upcoming: runs.filter((run) => !finished(run)).map((run) => row(run, timeZone, today, hrefFor?.(run.id))),
    recent: runs.filter(finished).map((run) => row(run, timeZone, today, hrefFor?.(run.id))),
    empty: runs.length === 0 ? { title: "No runs planned", description: "Select Schedule run to plan one: a date, a brand, and how many of each SKU." } : undefined,
    workChips: WORK_CHIPS,
    workTabs: WORK_TABS,
  };
}
