// lib/mgr/portal-orders-view.ts — view-model for portal Order history.
// portal_orders rows plus buyerStatus; shipped (unadjusted) rows offer Reorder.
import { docNo } from "./doc-no";
import { money } from "./money";
import { buyerStatus } from "./order-status";

export type PortalOrdersRowView = {
  key: string;
  title: string;
  detail: string;
  href: string;
  verb?: "Reorder" | "Continue / edit";
  warning?: boolean;
};

export type PortalOrdersViewModel = {
  subtitle: string;
  rows: PortalOrdersRowView[];
  info: string;
  empty?: string;
};

export type PortalOrdersLineSnapshot = {
  id: string;
  qty_ordered: number;
  qty_shipped: number | null;
  unit_price_cents?: number | null;
  skus?: { name: string } | null;
};

export type PortalOrdersSnapshot = {
  customerName: string;
  breweryName?: string;
  orders: {
    id: string;
    order_no: number | null;
    status: string;
    requested_ship_date: string | null;
    order_lines: PortalOrdersLineSnapshot[];
  }[];
};

function lineTotal(lines: PortalOrdersLineSnapshot[]): number | undefined {
  if (lines.length === 0 || lines.some((l) => typeof l.unit_price_cents !== "number")) return undefined;
  return lines.reduce((sum, l) => sum + l.unit_price_cents! * Number(l.qty_shipped ?? l.qty_ordered), 0);
}

function shortCopy(lines: PortalOrdersLineSnapshot[]): string | undefined {
  const shorts = lines.filter((l) => l.qty_shipped !== null && Number(l.qty_shipped) < Number(l.qty_ordered));
  if (shorts.length === 0) return undefined;
  const n = shorts.reduce((sum, l) => sum + (Number(l.qty_ordered) - Number(l.qty_shipped)), 0);
  const cases = shorts.every((l) => /case/i.test(l.skus?.name ?? ""));
  return cases ? `adjusted · ${n} ${n === 1 ? "case" : "cases"} short` : `adjusted · ${n} short`;
}

/** Map a portal_orders payload onto PortalOrdersView. */
export function toPortalOrdersViewProps({ customerName, breweryName, orders }: PortalOrdersSnapshot): PortalOrdersViewModel {
  return {
    subtitle: customerName,
    empty: orders.length === 0 ? "No orders yet. Start one from Order." : undefined,
    info: `Need a change? Call ${breweryName ?? "the brewery"}. Orders can’t be edited here after they’re placed.`,
    rows: orders.map((o) => {
      const adjusted = shortCopy(o.order_lines);
      const status = adjusted ?? buyerStatus(o.status, o.requested_ship_date);
      const total = lineTotal(o.order_lines);
      const reorder = o.status === "shipped";
      return {
        key: o.id,
        title: docNo("ORD", o.order_no, "Order"),
        detail: total === undefined ? status : `${status} · ${money(total)}`,
        href: reorder ? `/portal?reorder=${o.id}` : o.status === "draft" ? `/portal?draft=${o.id}` : `/portal/orders/${o.id}`,
        verb: reorder ? "Reorder" : o.status === "draft" ? "Continue / edit" : undefined,
        warning: Boolean(adjusted),
      };
    }),
  };
}
