import type { Filing, LossReview, Report } from "@/lib/commands/compliance";

export type MonthlyComplianceSnapshot = {
  monthLabel: string;
  report: Report;
  filing?: Filing;
  losses: LossReview[];
  backHref?: string;
};

export type MonthlyComplianceViewModel = {
  title: string;
  backHref?: string;
  filingDate?: string;
  balances: boolean;
  warnings: string[];
  losses: { source: LossReview; key: string; title: string; detail: string; allocations: { key: string; title: string; detail: string; bbl: string }[] }[];
  lines: string[][];
  inProcess: string;
  packaged: string;
  removals: { key: string; title: string; bbl: string }[];
  cellarRemovals: { key: string; title: string; bbl: string }[];
  byState: { key: string; title: string; bbl: string }[];
};

const REMOVAL_LABEL: Record<string, string> = {
  taxable: "Taxpaid removals", export: "Export", vessel_supplies: "Supplies for vessels", research: "Research",
  transfer_in_bond: "Transferred in bond", destruction: "Destroyed", loss: "Losses", sample: "Samples", festival_removal: "Festival removals",
};
const CLASS_LABEL = { keg: "kegs", can: "cans", bottle: "bottles" } as const;
const bbl = (value: number) => `${value.toFixed(2)} bbl`;
const removalBbl = (key: string, value: number) => key === "loss" ? `${value.toLocaleString("en-US", { maximumFractionDigits: 8 })} bbl` : bbl(value);
const label = (value: string) => REMOVAL_LABEL[value] ?? value.replace(/_/g, " ");

export function toMonthlyComplianceViewProps(snapshot: MonthlyComplianceSnapshot): MonthlyComplianceViewModel {
  const figures = snapshot.report.figures;
  return {
    title: snapshot.monthLabel,
    backHref: snapshot.backHref,
    filingDate: snapshot.filing?.filed_at?.slice(0, 10),
    balances: figures.balances,
    warnings: snapshot.report.warnings,
    losses: snapshot.losses.map((loss) => ({
      source: loss,
      key: loss.adjustment_id,
      title: `Batch ${loss.batch_no}`,
      detail: `Original generic loss ${loss.original_bbl} bbl · remaining ${loss.remaining_bbl} bbl`,
      allocations: loss.allocations.map((allocation) => ({
        key: allocation.id,
        title: `${allocation.classification[0].toUpperCase()}${allocation.classification.slice(1)}`,
        detail: `${allocation.destination_state ? `Destination ${allocation.destination_state}` : allocation.tax_treatment ? `Frozen ${label(allocation.tax_treatment)}` : ""} · prior allocation`.replace(/^ · /, ""),
        bbl: `${allocation.bbl} bbl`,
      })),
    })),
    lines: figures.lines.map((line) => [CLASS_LABEL[line.class], line.begin.toFixed(2), line.in.toFixed(2), line.out.toFixed(2), line.end.toFixed(2)]),
    inProcess: bbl(figures.inProcess),
    packaged: bbl(figures.packaged),
    removals: Object.entries(figures.removals).map(([key, value]) => ({ key, title: label(key), bbl: removalBbl(key, value) })),
    cellarRemovals: Object.entries(figures.cellarRemovals ?? {}).map(([key, value]) => ({ key, title: `Cellar · ${label(key)}`, bbl: `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 8 })} bbl` })),
    byState: Object.entries(figures.byState).map(([key, value]) => ({ key, title: `Taxpaid to ${key}`, bbl: bbl(value) })),
  };
}
