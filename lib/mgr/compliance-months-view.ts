// lib/mgr/compliance-months-view.ts — view-model for Compliance months.
import { firstPeriodFrom, periodLabel, type Cadence } from "@/lib/compliance-period";
import { formatDate } from "@/lib/date-format";
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
