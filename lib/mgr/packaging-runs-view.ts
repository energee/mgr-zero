import { breweryDate, formatDate } from "@/lib/date-format";
import { bblExact } from "@/lib/volume";
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
  /** Barrels drawn from the tank at close; null on a historical run. */
  bbl_drawn?: number | null;
  /** Barrels the close moved into stock, frozen at close (packaging_run_yields). */
  bbl_packaged?: number | null;
  /** What a closed run actually packaged, one entry per package unit. */
  outputs?: PackagedOutput[];
};

/** `bbl` is the volume frozen at close, or for a historical run the count at the format's volume; null when that format has none. */
export type PackagedOutput = { unit: "case" | "keg" | "each"; qty: number; bbl: number | null };

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
  /** Set on the first Recent row of each planned day: the day, its closed runs and their barrels. */
  heading?: string;
  /** Actual output in words, such as "93 cases · 19 kegs". */
  output?: string;
  /** Share of the packaged barrels that went into kegs, 0 to 100. */
  kegPercent?: number;
  yieldPercent?: number;
  lowYield?: boolean;
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

const UNIT_WORDS = { case: ["case", "cases"], keg: ["keg", "kegs"], each: ["unit", "units"] } as const;
const UNIT_ORDER = Object.keys(UNIT_WORDS);
/** A yield under this percent is drawn as a warning. */
const LOW_YIELD_PERCENT = 90;

/** Barrels across outputs, or undefined when any format has no volume. */
function packagedBbl(outputs: PackagedOutput[]) {
  return outputs.every(output => output.bbl !== null) ? outputs.reduce((sum, output) => sum + output.bbl!, 0) : undefined;
}

/** "1 case · 6 kegs": cases, then kegs, then loose units; a recorded zero is still stated. */
function outputWords(outputs: PackagedOutput[]) {
  if (outputs.length === 0) return undefined;
  return [...outputs].sort((a, b) => UNIT_ORDER.indexOf(a.unit) - UNIT_ORDER.indexOf(b.unit))
    .map(output => `${output.qty} ${UNIT_WORDS[output.unit][output.qty === 1 ? 0 : 1]}`).join(" · ");
}

function kegPercent(outputs: PackagedOutput[]) {
  const total = packagedBbl(outputs);
  if (!total) return undefined;
  return Math.round(packagedBbl(outputs.filter(output => output.unit === "keg"))! / total * 100);
}

/** Packaged over drawn; a run with no barrels drawn (historical) has no yield. */
function yieldPercent(run: PackagingRunSnapshot) {
  return run.bbl_drawn && run.bbl_packaged != null ? Math.round(run.bbl_packaged / run.bbl_drawn * 100) : undefined;
}

/** "Sep 4, 2026 · 2 runs · 14.5 bbl packaged" for one planned day's finished runs. */
function dayHeading(day: PackagingRunSnapshot[]) {
  const closed = day.filter(run => run.closed_at && !run.cancelled_at);
  const bbl = packagedBbl(closed.flatMap(run => run.outputs ?? []));
  return [
    formatDate(day[0].planned_on),
    closed.length > 0 && `${closed.length} ${closed.length === 1 ? "run" : "runs"}`,
    !!bbl && `${bblExact(bbl, 1)} packaged`,
  ].filter(Boolean).join(" · ");
}

function row(run: PackagingRunSnapshot, today: string, href?: string): PackagingRunRowView {
  const common = {
    key: run.id,
    runNo: runNo(run.run_no),
    brand: run.brand_name,
    date: formatDate(run.planned_on),
    source: run.vessel_name,
    quantity: [run.qty_planned, run.planned_unit].filter(value => value !== undefined).join(" "),
    href,
  };
  // Finished runs open their record without suggesting they can be reopened.
  if (run.cancelled_at) return { ...common, status: "Cancelled" };
  if (run.closed_at) {
    const percent = yieldPercent(run);
    return {
      ...common,
      status: "Closed",
      output: outputWords(run.outputs ?? []),
      kegPercent: kegPercent(run.outputs ?? []),
      yieldPercent: percent,
      lowYield: percent !== undefined && percent < LOW_YIELD_PERCENT,
    };
  }
  const verb = run.material_shortfall ? "Resolve" : run.started_at ? "Close" : run.vessel_name ? "Start" : "Pick source";
  return {
    ...common,
    overdue: !run.started_at && run.planned_on < today,
    shortfall: run.material_shortfall,
    verb,
    tone: run.material_shortfall || run.started_at ? "attention" : "info",
  };
}

/** A closed or cancelled run is history; everything else is still upcoming. */
const finished = (run: PackagingRunSnapshot) => !!(run.closed_at || run.cancelled_at);

/** `timeZone` is breweries.timezone: an unstarted run is overdue once the brewery's own day passes its planned date.
 *  Recent is grouped by planned day, newest first. A page of history is in created order, so it is re-sorted here.
 *  ponytail: the planned day stands in for the lot's packaged-on date, which matches it on every run so far;
 *  read the lot date in the list queries if runs start closing on a later day than planned. */
export function toPackagingRunsViewProps(runs: PackagingRunSnapshot[], timeZone: string, hrefFor?: (id: string) => string, at: Date = new Date()): PackagingRunsViewModel {
  const today = breweryDate(timeZone, at);
  const done = runs.filter(finished).sort((a, b) => b.planned_on.localeCompare(a.planned_on));
  return {
    upcoming: runs.filter((run) => !finished(run)).map((run) => row(run, today, hrefFor?.(run.id))),
    recent: done.map((run, index) => ({
      ...row(run, today, hrefFor?.(run.id)),
      heading: run.planned_on === done[index - 1]?.planned_on ? undefined : dayHeading(done.filter(other => other.planned_on === run.planned_on)),
    })),
    empty: runs.length === 0 ? { title: "No runs planned" } : undefined,
    workChips: WORK_CHIPS,
    workTabs: WORK_TABS,
  };
}
