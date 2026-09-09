// lib/mgr/keg-history-view.ts — view-model for Keg event history.
export type KegHistoryRowView = {
  key: string;
  title: string;
  detail: string;
  who?: string;
  warning?: boolean;
  ok?: boolean;
};

export type KegHistoryViewModel = {
  backHref?: string;
  customer: string;
  customerOptions: string[];
  pool: string;
  poolOptions: string[];
  rows: KegHistoryRowView[];
  empty?: string;
};

export type KegHistorySnapshot = {
  backHref?: string;
  customer?: string;
  customerOptions?: string[];
  pool?: string;
  poolOptions?: string[];
  rows?: KegHistoryRowView[];
};

export function toKegHistoryViewProps(s: KegHistorySnapshot): KegHistoryViewModel {
  const rows = s.rows ?? [];
  return {
    backHref: s.backHref,
    customer: s.customer ?? "All customers",
    customerOptions: s.customerOptions ?? ["All customers"],
    pool: s.pool ?? "All pools",
    poolOptions: s.poolOptions ?? ["All pools"],
    rows,
    empty: rows.length === 0 ? "No matching events" : undefined,
  };
}
