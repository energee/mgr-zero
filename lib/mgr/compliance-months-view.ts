// lib/mgr/compliance-months-view.ts — view-model for Compliance months.
export type ComplianceNavView = {
  key: string;
  title: string;
  detail: string;
  tone?: "" | "ok" | "w";
  href?: string;
};

export type ComplianceMonthsViewModel = {
  months: ComplianceNavView[];
  registry: ComplianceNavView;
  lots: ComplianceNavView[];
};

export function toComplianceMonthsViewProps(s: ComplianceMonthsViewModel): ComplianceMonthsViewModel {
  return s;
}
