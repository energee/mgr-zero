import type { Filing, LossReview, Report, StateTransaction } from "@/lib/commands/compliance";
import { destinationStateTotals } from "./destination-state-export";
import { money } from "./money";
import { sentenceCase } from "./labels";
import { bblExact, bblFixed } from "@/lib/volume";
import { formatDate } from "@/lib/date-format";
import type { EmptyState } from "./empty-state";
import { periodStatus, type PeriodStatus } from "@/lib/compliance-period";
import { batNo } from "./doc-no";
import { submitReason } from "./submit-reason";
import { booksVerb, NOT_REPORTED_BEFORE_BOOKS } from "./compliance-months-view";

export type MonthlyComplianceSnapshot = {
  monthLabel: string;
  timeZone: string;
  today: string;
  report: Report;
  filing?: Filing;
  losses: LossReview[];
  backHref?: string;
};

export type MonthlyComplianceViewModel = ComplianceFiguresViewModel & {
  title: string;
  timeZone: string;
  periodStatus: PeriodStatus;
  periodStart: string;
  backHref?: string;
  filingDate?: string;
  amendments?: { id: string; oldBasis: string; newBasis: string; actor: string; at: string; reason: string; invalidPeriod: boolean; figures: ComplianceFiguresViewModel }[];
  /** The report's warnings in staff words (plainWarning), drawn under step 2's figures. */
  warnings: string[];
  /** Why Save filed snapshot is off, printed beside it: the blocking warnings in the same
   *  words as step 2 (#1143, #1122); null when the report balances. */
  fileReason: string | null;
  losses: { source: LossReview; key: string; title: string; detail: string; allocations: { key: string; title: string; detail: string; bbl: string }[] }[];
};

export type ComplianceFiguresViewModel = {
  balances: boolean;
  lines: string[][];
  inProcess: string;
  inProcessAsOf?: string;
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
const CLASS_LABEL = { keg: "Kegs", can: "Cans", bottle: "Bottles" } as const;
const removalBbl = (key: string, value: number) => key === "loss" ? bblExact(value, 8) : bblFixed(value);
const label = (value: string) => REMOVAL_LABEL[value] ?? sentenceCase(value);

/** generate_compliance_report's one warning that does not block filing; its other
 *  warnings are the reasons `balances` is false. This must match the SQL literal
 *  exactly (supabase/migrations/20261013100000_file_cellar_taproom_removals.sql);
 *  if the SQL wording changes, the note leaks into the Save-off reason. */
const UNASSIGNED_WARNING = "Some supporting facts have no recorded destination. Review Unassigned; MGR does not infer a state.";

/** One report warning in staff words (#1143). The SQL writes three shapes; any
 *  other warning is shown as written, so a new one is never hidden. */
function plainWarning(warning: string): string {
  if (warning === UNASSIGNED_WARNING) return "Some transactions have no recorded destination. Check the Unassigned row; MGR does not guess a state.";
  const unbalanced = /^(keg|can|bottle) does not balance$/.exec(warning)?.[1] as keyof typeof CLASS_LABEL | undefined;
  if (unbalanced) return `${CLASS_LABEL[unbalanced]} do not balance.`;
  const unclassified = /^unclassified movement type (.+)$/.exec(warning)?.[1];
  if (unclassified) return `${sentenceCase(unclassified)} movements have no report column.`;
  return warning;
}

function toComplianceFigures(figures: Report["figures"]): ComplianceFiguresViewModel {
  return {
    balances: figures.balances,
    lines: figures.lines.map((line) => [CLASS_LABEL[line.class], line.begin.toFixed(2), line.in.toFixed(2), line.out.toFixed(2), line.end.toFixed(2)]),
    inProcess: bblFixed(figures.inProcess),
    inProcessAsOf: figures.inProcessAsOf ? formatDate(figures.inProcessAsOf) : undefined,
    packaged: bblFixed(figures.packaged),
    removals: Object.entries(figures.removals).map(([key, value]) => ({ key, title: label(key), bbl: removalBbl(key, value) })),
    cellarRemovals: Object.entries(figures.cellarRemovals ?? {}).map(([key, value]) => ({ key, title: `Cellar · ${label(key)}`, bbl: bblExact(value, 8) })),
    stateRows: destinationStateTotals(figures.stateTransactions ?? []).map(row => [row.state, bblExact(row.outwardBbl, 8), bblExact(row.returnedBbl, 8), bblExact(row.adjustmentBbl, 8), bblExact(row.volumeBbl, 8), money(row.invoicedCents), money(row.creditedCents), money(row.salesCents)]),
    stateExport: figures.stateTransactions ? { periodStart: figures.periodStart, periodEnd: figures.periodEnd, facts: figures.stateTransactions } : undefined,
    byState: Object.entries(figures.byState).map(([key, value]) => ({ key, title: `Taxpaid to ${key}`, bbl: bblFixed(value) })),
  };
}

export function toMonthlyComplianceViewProps(snapshot: MonthlyComplianceSnapshot): MonthlyComplianceViewModel {
  const figures = snapshot.report.figures;
  return {
    ...toComplianceFigures(figures),
    title: snapshot.monthLabel,
    timeZone: snapshot.timeZone,
    periodStatus: periodStatus(figures, snapshot.today),
    periodStart: formatDate(figures.periodStart),
    backHref: snapshot.backHref,
    filingDate: snapshot.filing?.filed_at ? formatDate(snapshot.filing.filed_at, snapshot.timeZone) : undefined,
    amendments: snapshot.filing?.basis_amendments?.map(row => ({
      id: row.correction_id,
      oldBasis: row.correction.old_basis ? formatDate(row.correction.old_basis) : "Not set",
      newBasis: row.correction.new_basis ? formatDate(row.correction.new_basis) : "Not set",
      actor: row.correction.corrected_by,
      at: row.correction.corrected_at,
      reason: row.correction.reason,
      invalidPeriod: row.correction.new_basis !== null && figures.periodStart < row.correction.new_basis,
      figures: toComplianceFigures(row.new_figures),
    })),
    warnings: snapshot.report.warnings.map(plainWarning),
    // The SQL sets `balances` to "no blocking warnings" and appends the Unassigned note after,
    // so a false `balances` always leaves at least one warning for the reason to name.
    fileReason: figures.balances ? null : `Save is off: ${snapshot.report.warnings.filter((warning) => warning !== UNASSIGNED_WARNING).map(plainWarning).join(" ")}`,
    losses: snapshot.losses.map((loss) => ({
      source: loss,
      key: loss.adjustment_id,
      title: `${batNo(loss.batch_no)} · ${loss.kind} loss`,
      detail: `Recorded ${bblExact(Number(loss.original_bbl), 8)} · ${bblExact(Number(loss.remaining_bbl), 8)} left to reattribute`,
      allocations: loss.allocations.map((allocation) => ({
        key: allocation.id,
        title: sentenceCase(allocation.classification),
        detail: `${allocation.destination_state ? `Destination ${allocation.destination_state}` : allocation.tax_treatment ? `Reported as ${label(allocation.tax_treatment)}` : ""} · reattributed earlier`.replace(/^ · /, ""),
        bbl: bblExact(Number(allocation.bbl), 8),
      })),
    })),
  };
}

function bblUnits(value: string) {
  if (!/^(?:\d+(?:\.\d{0,8})?|\.\d{1,8})$/.test(value) || !/[1-9]/.test(value)) return null;
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole || "0") * BigInt(100_000_000) + BigInt(fraction.padEnd(8, "0") || "0");
}

/** The remaining loss as the BBL field's starting text, so the whole-loss case is pick a target and Save (#1510).
 *  Trims the stored decimal's trailing zeros as text: Number() would print 0.0000005 as "5e-7", which bblUnits rejects. */
export function remainingAmountText(remaining: string) {
  return remaining.includes(".") ? remaining.replace(/\.?0+$/, "") : remaining;
}

/** Where a reattributed loss goes; each posts to its own TTB line. */
export type LossTarget = "sample" | "taproom" | "destruction";

/** Keep the reason and Save eligibility on the same exact, eight-decimal comparison. The target starts unchosen ("")
 *  because a wrong default would post the loss to the wrong TTB line (#1510). */
export function lossReviewReason(amount: string, remaining: string, target: LossTarget | "", state: string): string | null {
  const amountUnits = bblUnits(amount);
  const remainingUnits = bblUnits(remaining);
  const missing: string[] = [];
  if (amountUnits === null) missing.push("a positive amount with up to eight decimal places");
  else if (remainingUnits === null || amountUnits > remainingUnits) missing.push(`an amount no greater than the remaining ${bblExact(Number(remaining), 8)}`);
  if (!target) missing.push("a target");
  if (target === "sample" && !/^[A-Z]{2}$/.test(state)) missing.push("a two-letter destination state");
  return submitReason(missing);
}

/** The Before the books opened empty state; `action` is absent for roles that cannot open Settings. */
export type BeforeBooksState = EmptyState & { action?: { label: string; href?: string } };

/** A period that starts before the books opened has no report; say so instead of failing (#987).
 *  Settings is admin-only, so only an admin gets Open Settings; anyone else is told to ask an admin
 *  rather than given a link that would land on No access (the #1020 Menu pattern). */
export function beforeBooksState(periodLabel: string, booksOpenedOn: string, admin: boolean, today: string): BeforeBooksState {
  const why = `${periodLabel} starts before the books ${booksVerb(booksOpenedOn, today)} on ${formatDate(booksOpenedOn)}, so MGR has no report for it. ${NOT_REPORTED_BEFORE_BOOKS}`;
  return admin
    ? { title: "Before the books opened", description: `${why} The books-opened date is in Settings.`, action: { label: "Open Settings", href: "/settings" } }
    : { title: "Before the books opened", description: `${why} Ask an admin to change the books-opened date.` };
}
