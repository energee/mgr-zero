// lib/mgr/contracts-view.ts — view-model for the Contracts list.
import type { EmptyState } from "./empty-state";
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
  empty?: EmptyState;
};

export type ContractsSnapshot = { backHref?: string; rows?: ContractsRowView[] };

export function toContractsViewProps(s: ContractsSnapshot): ContractsViewModel {
  const rows = s.rows ?? [];
  return { backHref: s.backHref, rows, empty: rows.length === 0 ? { title: "No commitments yet", description: "A contract records beer promised to a customer before it is brewed." } : undefined };
}
