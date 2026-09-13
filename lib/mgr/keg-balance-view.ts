// lib/mgr/keg-balance-view.ts — view-model for Customer keg balance.
import type { EmptyState } from "./empty-state";
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
  empty?: EmptyState;
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
    empty: rows.length === 0 ? { title: "No kegs currently out", description: "Every keg in the fleet is back at the brewery." } : undefined,
  };
}
