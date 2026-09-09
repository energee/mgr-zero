// lib/mgr/purchase-orders-view.ts — view-model for the Purchase orders list.
import { WORK_CHIPS, WORK_TABS } from "@/lib/mgr/work-view";

export type PurchaseOrdersRowView = {
  key: string;
  title: string;
  detail: string;
  verb: string;
  tone: "info" | "attention" | "success" | "primary";
  warning?: boolean;
  href?: string;
};

export type PurchaseOrdersViewModel = {
  title: string;
  subtitle: string;
  rows: PurchaseOrdersRowView[];
  empty?: string;
  workChips: string[];
  workChipIndex: number;
  workTabs: Record<string, string>;
};

export type PurchaseOrdersSnapshot = {
  title: string;
  subtitle: string;
  rows?: PurchaseOrdersRowView[];
  empty?: string;
};

export function toPurchaseOrdersViewProps(s: PurchaseOrdersSnapshot): PurchaseOrdersViewModel {
  const rows = s.rows ?? [];
  return {
    title: s.title,
    subtitle: s.subtitle,
    rows,
    empty: s.empty ?? (rows.length === 0 ? "No open purchase orders" : undefined),
    workChips: WORK_CHIPS,
    workChipIndex: 5,
    workTabs: WORK_TABS,
  };
}
