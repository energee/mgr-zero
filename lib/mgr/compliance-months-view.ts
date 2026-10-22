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
  /** The filing cadence tabs (Monthly, Quarterly, Annual) and the one shown. */
  cadences: string[];
  cadence: number;
  /** The periods of the shown cadence; the name predates quarters and years. */
  months: ComplianceNavView[];
  /** Shown in place of the periods when there are none. */
  empty?: EmptyState;
  registry: ComplianceNavView;
  lots: ComplianceNavView[];
};

const CADENCE_WORD: Record<Cadence, string> = { month: "monthly", quarter: "quarterly", year: "annual" };

/** Why a cadence lists no period: every recent one starts before the books opened (#987). */
export function noPeriodsYet(cadence: Cadence, booksOpenedOn: string): EmptyState {
  const word = CADENCE_WORD[cadence];
  return {
    title: `No ${word} period yet`,
    description: `The books opened on ${formatDate(booksOpenedOn)}. ${periodLabel(firstPeriodFrom(booksOpenedOn, cadence))} is the first ${word} period MGR can report, and it is listed here once it starts.`,
  };
}

/** One period row: filed (with its day and taxpaid barrels), needs amendment,
 *  not filed, or still in progress, in sentence case (#1144). The live page adds
 *  the href; inventory rows stay inert. A filing whose filed_at is unset still
 *  reads as filed; only its day is unknown. */
export function periodRow(key: string, filing: Filing | undefined, today: string, timeZone: string): ComplianceNavView {
  const title = periodLabel(key);
  if (!filing) {
    return periodOver(key, today)
      ? { key, title, detail: "Not filed · Ready to review", tone: "w" }
      : { key, title, detail: `In progress · File after the ${cadenceOf(key)} ends`, tone: "w" };
  }
  const filed = filing.filed_at ? `Filed ${formatDate(filing.filed_at, timeZone)}` : "Filed";
  return filing.needs_amendment
    ? { key, title, detail: `Needs amendment · ${filed}`, tone: "w" }
    : { key, title, detail: `${filed} · ${bblFixed(filing.figures.removals.taxable ?? 0)} taxpaid`, tone: "ok" };
}
