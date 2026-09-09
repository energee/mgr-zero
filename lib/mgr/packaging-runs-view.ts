import { runNo } from "@/lib/mgr/doc-no";
import { WORK_CHIPS, WORK_TABS } from "@/lib/mgr/work-view";

export type PackagingRunSnapshot = {
  id: string;
  run_no: number;
  planned_on: string;
  started_at: string | null;
  closed_at: string | null;
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
  title: string;
  detail: string;
  verb?: string;
  tone?: "info" | "attention" | "success";
  warning?: boolean;
  href?: string;
};

export type PackagingRunsViewModel = {
  upcoming: PackagingRunRowView[];
  recent: PackagingRunRowView[];
  workChips: string[];
  workTabs: Record<string, string>;
};

function row(run: PackagingRunSnapshot, href?: string): PackagingRunRowView {
  const title = `${runNo(run.run_no)} · ${run.brand_name ?? "no brand"}`;
  if (run.closed_at) {
    const detail = [
      `closed ${run.planned_on}`,
      run.lot_code,
      run.output_summary ?? `${run.qty_planned} planned`,
      run.yield_percent === undefined ? undefined : `${run.yield_percent}% yield`,
      run.loss_bbl ? `${run.loss_bbl} bbl loss` : undefined,
    ].filter(Boolean).join(" · ");
    return { key: run.id, title, detail, verb: href ? "Open" : undefined, tone: "success", warning: Boolean(run.loss_bbl), href };
  }
  const verb = run.material_shortfall ? "Resolve" : run.started_at ? "Close" : run.vessel_name ? "Start" : "Pick source";
  const detail = [run.planned_on, run.vessel_name ?? "no source yet", run.qty_planned ? `${run.qty_planned} ${run.planned_unit ?? "units"} planned` : undefined, run.material_shortfall].filter(Boolean).join(" · ");
  return { key: run.id, title, detail, verb, tone: run.material_shortfall || run.started_at ? "attention" : "info", warning: Boolean(run.material_shortfall), href };
}

export function toPackagingRunsViewProps(runs: PackagingRunSnapshot[], hrefFor?: (id: string) => string): PackagingRunsViewModel {
  return {
    upcoming: runs.filter((run) => !run.closed_at).map((run) => row(run, hrefFor?.(run.id))),
    recent: runs.filter((run) => run.closed_at).map((run) => row(run, hrefFor?.(run.id))),
    workChips: WORK_CHIPS,
    workTabs: WORK_TABS,
  };
}
