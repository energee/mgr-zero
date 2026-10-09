import type { Filing, LossReview, Report, StateTransaction } from "@/lib/commands/compliance";
import { destinationStateTotals } from "./destination-state-export";
import { money } from "./money";
import { sentenceCase } from "./labels";
import { bblExact, bblFixed } from "@/lib/volume";

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
  stateRows: string[][];
  stateExport?: { periodStart: string; periodEnd: string; facts: StateTransaction[] };
  byState: { key: string; title: string; bbl: string }[];
};

const REMOVAL_LABEL: Record<string, string> = {
  taxable: "Taxpaid removals", export: "Export", vessel_supplies: "Supplies for vessels", research: "Research",
  transfer_in_bond: "Transferred in bond", destruction: "Destroyed", loss: "Losses", sample: "Samples", festival_removal: "Festival removals",
};
const CLASS_LABEL = { keg: "kegs", can: "cans", bottle: "bottles" } as const;
const removalBbl = (key: string, value: number) => key === "loss" ? bblExact(value, 8) : bblFixed(value);
const label = (value: string) => REMOVAL_LABEL[value] ?? sentenceCase(value);

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
      title: `Batch ${loss.batch_no} · ${loss.kind} loss`,
      detail: `Original generic loss ${loss.original_bbl} bbl · remaining ${loss.remaining_bbl} bbl`,
      allocations: loss.allocations.map((allocation) => ({
        key: allocation.id,
        title: `${allocation.classification[0].toUpperCase()}${allocation.classification.slice(1)}`,
        detail: `${allocation.destination_state ? `Destination ${allocation.destination_state}` : allocation.tax_treatment ? `Frozen ${label(allocation.tax_treatment)}` : ""} · prior allocation`.replace(/^ · /, ""),
        bbl: `${allocation.bbl} bbl`,
      })),
    })),
    lines: figures.lines.map((line) => [CLASS_LABEL[line.class], line.begin.toFixed(2), line.in.toFixed(2), line.out.toFixed(2), line.end.toFixed(2)]),
    inProcess: bblFixed(figures.inProcess),
    packaged: bblFixed(figures.packaged),
    removals: Object.entries(figures.removals).map(([key, value]) => ({ key, title: label(key), bbl: removalBbl(key, value) })),
    cellarRemovals: Object.entries(figures.cellarRemovals ?? {}).map(([key, value]) => ({ key, title: `Cellar · ${label(key)}`, bbl: bblExact(value, 8) })),
    stateRows: destinationStateTotals(figures.stateTransactions ?? []).map(row => [row.state, bblExact(row.outwardBbl, 8), bblExact(row.returnedBbl, 8), bblExact(row.adjustmentBbl, 8), bblExact(row.volumeBbl, 8), money(row.invoicedCents), money(row.creditedCents), money(row.salesCents)]),
    stateExport: figures.stateTransactions ? { periodStart: figures.periodStart, periodEnd: figures.periodEnd, facts: figures.stateTransactions } : undefined,
    byState: Object.entries(figures.byState).map(([key, value]) => ({ key, title: `Taxpaid to ${key}`, bbl: bblFixed(value) })),
  };
}
