// lib/mgr/orders-list-view.ts — view-model for the Work → Orders register:
// each row keeps the order's facts separate (number, customer, requested
// date, status, staged restock) for the shared RecordTable, plus the Status
// pick and the customer scope line. Live links come only with `linked`.
import type { ScopeOption } from "@/components/mgr/scope-pick";
import { formatDate } from "@/lib/date-format";
import type { EmptyState } from "./empty-state";
import { docNo } from "./doc-no";
import { sentenceCase } from "./labels";
import { nextAction, ORDER_STATUSES, type ActionTone, type OrderStatus } from "./order-status";

export type OrdersListRowView = {
  key: string;
  /** docNo: "ORD-0231", or "Order" before a number exists. */
  orderNo: string;
  /** null when the order has no customer join (a transfer). */
  customer: string | null;
  /** The requested calendar day, formatted; null when none was requested. */
  shipDate: string | null;
  status: OrderStatus;
  /** Staged stock waits for Put back; shown as its own badge beside the status. */
  restock: boolean;
  /** The order page; live only. */
  href?: string;
  /** nextAction's verb when it is more than Open, which the number link already does. */
  action?: { verb: string; tone: ActionTone; href?: string };
};

export type OrdersListViewModel = {
  rows: OrdersListRowView[];
  empty?: EmptyState;
  /** The Status pick: "all" or one OrderStatus. */
  status: string;
  statusOptions: ScopeOption[];
  /** The customer scope line; clearHref drops the customer and keeps the status. */
  customer?: { name: string; clearHref?: string };
};

export type OrdersListSnapshot = {
  roles: readonly string[];
  status?: string;
  /** The filtered customer's name; an empty list then names it instead of saying "No orders yet". */
  customer?: string;
  customerId?: string;
  /** The live page: rows, actions, Status options and Clear carry hrefs. The inventory leaves them inert. */
  linked?: boolean;
  orders: {
    id: string;
    order_no: number | null;
    status: OrderStatus;
    requested_ship_date: string | null;
    needs_restock: boolean;
    customers: { name: string } | null;
  }[];
};

/** /orders with this customer and status; a filter change starts at the newest page, so no cursor. */
function ordersHref(customerId: string | undefined, status: string | undefined) {
  const query = new URLSearchParams();
  if (customerId) query.set("customerId", customerId);
  if (status) query.set("status", status);
  return `/orders${query.size ? `?${query}` : ""}`;
}

export function toOrdersListViewProps({ roles, status, customer, customerId, linked, orders }: OrdersListSnapshot): OrdersListViewModel {
  const what = status ? `${status} orders` : "orders";
  const title = customer ? `No ${what} for ${customer}` : status ? `No ${what}` : "No orders yet";
  const link = (href: string) => (linked ? href : undefined);
  return {
    empty: orders.length === 0 ? { title, description: "Orders appear here once they are placed." } : undefined,
    status: status ?? "all",
    statusOptions: [
      { value: "all", label: "All states", href: link(ordersHref(customerId, undefined)) },
      ...ORDER_STATUSES.map((s) => ({ value: s, label: sentenceCase(s), href: link(ordersHref(customerId, s)) })),
    ],
    customer: customer ? { name: customer, clearHref: link(ordersHref(undefined, status)) } : undefined,
    rows: orders.map((o) => {
      const { verb, tone, href } = nextAction(o.status, o.needs_restock, o.id, roles);
      return {
        key: o.id,
        orderNo: docNo("ORD", o.order_no, "Order"),
        customer: o.customers?.name ?? null,
        shipDate: o.requested_ship_date ? formatDate(o.requested_ship_date) : null,
        status: o.status,
        restock: o.needs_restock,
        href: link(`/orders/${o.id}`),
        action: verb === "Open" ? undefined : { verb, tone, href: link(href) },
      };
    }),
  };
}
