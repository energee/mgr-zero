// lib/mgr/portal-orders-view.ts — view-model for portal Order history.
// portal_orders rows plus buyerStatus; drafts continue and shipped rows reorder.
// A submitted order with a release line reads as a pre-order.
import { plural } from "@/lib/mgr/plural";
import type { EmptyState } from "./empty-state";
import { docNo } from "./doc-no";
import { money } from "./money";
import { buyerStatus } from "./order-status";
import { formatDate } from "@/lib/date-format";

export type PortalOrdersRowView = {
  key: string;
  title: string;
  detail: string;
  href: string;
  actionHref?: string;
  verb?: "Reorder" | "Continue / edit";
  warning?: boolean;
};

export type PortalOrdersViewModel = {
  rows: PortalOrdersRowView[];
  info: string;
  empty?: EmptyState;
};

export type PortalOrdersLineSnapshot = {
  id: string;
  qty_ordered: number;
  qty_shipped: number | null;
  unit_price_cents?: number | null;
  /** The release this line orders from (portal releases); null or absent for stock. */
  release_id?: string | null;
  skus?: { name: string } | null;
};

export type PortalOrdersSnapshot = {
  breweryName: string;
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
  return cases ? `adjusted · ${plural(n, "case")} short` : `adjusted · ${n} short`;
}

/** Map a portal_orders payload onto PortalOrdersView. */
export function toPortalOrdersViewProps({ breweryName, orders }: PortalOrdersSnapshot): PortalOrdersViewModel {
  return {
    empty: orders.length === 0 ? { title: "No orders yet" } : undefined,
    info: `Need a change? Call ${breweryName}. Orders can’t be edited here after they’re placed.`,
    rows: orders.map((o) => {
      const adjusted = shortCopy(o.order_lines);
      // A submitted order ordering from a release is a pre-order until the brewery confirms it.
      const preOrder = o.status === "submitted" && o.order_lines.some((l) => l.release_id);
      const status = adjusted ?? (preOrder ? `Pre-order — may change until the brewery confirms${o.requested_ship_date ? ` · ships ${formatDate(o.requested_ship_date)}` : ""}` : buyerStatus(o.status, o.requested_ship_date));
      const total = lineTotal(o.order_lines);
      const reorder = o.status === "shipped";
      return {
        key: o.id,
        title: docNo("ORD", o.order_no, "Order"),
        detail: total === undefined ? status : `${status} · ${money(total)}`,
        href: `/portal/orders/${o.id}`,
        actionHref: reorder ? `/portal?reorder=${o.id}` : o.status === "draft" ? `/portal?draft=${o.id}` : undefined,
        verb: reorder ? "Reorder" : o.status === "draft" ? "Continue / edit" : undefined,
        warning: Boolean(adjusted),
      };
    }),
  };
}
