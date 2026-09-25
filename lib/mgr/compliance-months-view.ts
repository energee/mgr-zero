// lib/mgr/compliance-months-view.ts — view-model for Compliance months.
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
  registry: ComplianceNavView;
  lots: ComplianceNavView[];
};
