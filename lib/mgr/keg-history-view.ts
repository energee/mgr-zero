// lib/mgr/keg-history-view.ts — view-model for Keg event history: the ledger
// rows and the Keg pool and Customer scopes (ScopePick options; "all" selects
// every pool or customer).
import type { ScopeOption } from "@/components/mgr/scope-pick";
import type { EmptyState } from "./empty-state";
export type KegHistoryRowView = {
  key: string;
  title: string;
  detail: string;
  warning?: boolean;
  ok?: boolean;
};

export type KegHistoryViewModel = {
  backHref?: string;
  pool: string;
  poolOptions: ScopeOption[];
  customer: string;
  customerOptions: ScopeOption[];
  rows: KegHistoryRowView[];
  empty?: EmptyState;
};

export type KegHistorySnapshot = Partial<Omit<KegHistoryViewModel, "empty">>;

export function toKegHistoryViewProps(s: KegHistorySnapshot): KegHistoryViewModel {
  const rows = s.rows ?? [];
  return {
    backHref: s.backHref,
    pool: s.pool ?? "all",
    poolOptions: s.poolOptions ?? [{ value: "all", label: "All pools" }],
    customer: s.customer ?? "all",
    customerOptions: s.customerOptions ?? [{ value: "all", label: "All customers" }],
    rows,
    empty: rows.length === 0 ? { title: "No matching events", description: "Widen the filter to see more of the keg's history." } : undefined,
  };
}
