// lib/mgr/contracts-view.ts — view-model for the Contracts list.
export type ContractsRowView = {
  key: string;
  title: string;
  detail: string;
  verb: string;
  warning?: boolean;
};

export type ContractsViewModel = {
  backHref?: string;
  rows: ContractsRowView[];
  empty?: string;
};

export type ContractsSnapshot = { backHref?: string; rows?: ContractsRowView[] };

export function toContractsViewProps(s: ContractsSnapshot): ContractsViewModel {
  const rows = s.rows ?? [];
  return { backHref: s.backHref, rows, empty: rows.length === 0 ? "No commitments yet" : undefined };
}
