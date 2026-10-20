// lib/mgr/purchase-orders-view.ts — view-model for the Purchase orders list.
import type { EmptyState } from "./empty-state";
import { WORK_CHIPS, WORK_TABS } from "@/lib/mgr/work-view";

export type PurchaseOrdersRowView = {
  key: string;
  title: string;
  detail: string;
  /** The next action; a closed order has none and its row is a plain link (#996). */
  verb?: string;
  tone?: "info" | "attention";
  warning?: boolean;
  href?: string;
};

export type PurchaseOrdersViewModel = {
  title: string;
  subtitle: string;
  rows: PurchaseOrdersRowView[];
  empty?: EmptyState;
  workChips: string[];
  workChipIndex: number;
  workTabs: Record<string, string>;
};

export type PurchaseOrdersSnapshot = {
  title: string;
  subtitle: string;
  rows?: PurchaseOrdersRowView[];
  empty?: EmptyState;
  /** Closed orders included, so an empty list means there are none at all. */
  includeClosed?: boolean;
};

/** A purchase order row's next action, from its status. A received or
 *  cancelled order has none: its row is a plain link, because "Open" on a
 *  closed order reads as reopen (#996). */
export function purchaseOrderNext(status: string): { verb: string; tone: "info" | "attention" } | undefined {
  if (status === "draft") return { verb: "Mark sent", tone: "info" };
  if (status === "received" || status === "cancelled") return undefined;
  return { verb: "Receive", tone: status === "partially_received" ? "attention" : "info" };
}

export function toPurchaseOrdersViewProps(s: PurchaseOrdersSnapshot): PurchaseOrdersViewModel {
  const rows = s.rows ?? [];
  return {
    title: s.title,
    subtitle: s.subtitle,
    rows,
    empty: s.empty ?? (rows.length === 0
      ? { title: s.includeClosed ? "No purchase orders yet" : "No open purchase orders", description: "Raise one to order materials from a vendor." }
      : undefined),
    workChips: WORK_CHIPS,
    workChipIndex: 5,
    workTabs: WORK_TABS,
  };
}
