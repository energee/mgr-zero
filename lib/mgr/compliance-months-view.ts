// lib/mgr/compliance-months-view.ts — view-model for Compliance months.
import type { Filing } from "@/lib/commands/compliance";
import { cadenceOf, firstPeriodFrom, periodLabel, periodOver, type Cadence } from "@/lib/compliance-period";
import { formatDate } from "@/lib/date-format";
import { bblFixed } from "@/lib/volume";
import type { EmptyState } from "./empty-state";

export type ComplianceNavView = {
  key: string;
  title: string;
  detail: string;
  tone?: "" | "ok" | "w";
  href?: string;
};

export type ComplianceMonthsViewModel = {
  backHref?: string;
  /** The filing cadence tabs (Monthly, Quarterly, Annual) and the one shown. */
  cadences: string[];
  cadence: number;
  /** The periods of the shown cadence; the name predates quarters and years. */
  months: ComplianceNavView[];
  /** Shown in place of the periods when there are none. */
  empty?: EmptyState;
  registry: ComplianceNavView;
  /** The lots a lot-code search found; none before a search. */
  lots: ComplianceNavView[];
  /** Shown in place of the lots when a search matched none. */
  lotsEmpty?: EmptyState;
};

/** A lot-code search that found no lot (#1510). */
export const noLotMatch: EmptyState = { title: "No lots match", description: "Check the lot code, or clear the search." };

const CADENCE_WORD: Record<Cadence, string> = { month: "monthly", quarter: "quarterly", year: "annual" };

/** "open" while the books-opened day is still after `today` (the brewery's day), else "opened" (#1496). */
export const booksVerb = (booksOpenedOn: string, today: string) => (booksOpenedOn > today ? "open" : "opened");

/** Why activity dated before books_opened_on shows in no period: the report never counts it. */
export const NOT_REPORTED_BEFORE_BOOKS = "Activity before that date is not reported in MGR.";

/** Why a cadence lists no period: every recent one starts before the books opened (#987). */
export function noPeriodsYet(cadence: Cadence, booksOpenedOn: string, today: string): EmptyState {
  const word = CADENCE_WORD[cadence];
  return {
    title: `No ${word} period yet`,
    description: `The books ${booksVerb(booksOpenedOn, today)} on ${formatDate(booksOpenedOn)}. ${NOT_REPORTED_BEFORE_BOOKS} ${periodLabel(firstPeriodFrom(booksOpenedOn, cadence))} is the first ${word} period MGR can report, and it is listed here once it starts.`,
  };
}

/** One period row: filed (with its day and taxpaid barrels), needs amendment,
 *  not filed, or still in progress, in sentence case (#1144). An ended, unfiled
 *  period reads No activity when `active` is false: the report reads no row
 *  dated in it (list_compliance_reports activePeriods, #1209). It is still
 *  Not filed, because an empty period is filed too. The live page adds
 *  the href; inventory rows stay inert. A filing whose filed_at is unset still
 *  reads as filed; only its day is unknown. */
export function periodRow(key: string, filing: Filing | undefined, today: string, timeZone: string, active: boolean): ComplianceNavView {
  const title = periodLabel(key);
  if (!filing) {
    if (!periodOver(key, today)) return { key, title, detail: `In progress · File after the ${cadenceOf(key)} ends`, tone: "w" };
    return { key, title, detail: `Not filed · ${active ? "Ready to review" : "No activity"}`, tone: "w" };
  }
  const filed = filing.filed_at ? `Filed ${formatDate(filing.filed_at, timeZone)}` : "Filed";
  return filing.needs_amendment
    ? { key, title, detail: `Needs amendment · ${filed}`, tone: "w" }
    : { key, title, detail: `${filed} · ${bblFixed(filing.figures.removals.taxable ?? 0)} taxpaid`, tone: "ok" };
}
