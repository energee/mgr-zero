// lib/mgr/keg-balance-view.ts — view-model for Customer keg balance.
export type KegBalanceRowView = {
  key: string;
  title: string;
  detail: string;
  trailing: string;
  warning?: boolean;
  verb?: string;
};

export type KegBalanceViewModel = {
  backHref?: string;
  customer: string;
  kegs: string;
  deposits: string;
  rows: KegBalanceRowView[];
  empty?: string;
};

export type KegBalanceSnapshot = {
  backHref?: string;
  customer: string;
  kegs: string;
  deposits: string;
  rows?: KegBalanceRowView[];
};

export function toKegBalanceViewProps(s: KegBalanceSnapshot): KegBalanceViewModel {
  const rows = s.rows ?? [];
  return {
    backHref: s.backHref,
    customer: s.customer,
    kegs: s.kegs,
    deposits: s.deposits,
    rows,
    empty: rows.length === 0 ? "No kegs currently out" : undefined,
  };
}
