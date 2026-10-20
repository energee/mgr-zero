// lib/mgr/orders-list-view.ts — view-model for the Work → Orders list.
import { formatDate } from "@/lib/date-format";
import type { EmptyState } from "./empty-state";
import { docNo } from "./doc-no";
import { nextAction, type ActionTone, type OrderStatus } from "./order-status";

export type OrdersListRowView = {
  key: string;
  title: string;
  detail: string;
  verb: string;
  tone: ActionTone;
  href: string;
  warning?: boolean;
};

export type OrdersListViewModel = {
  rows: OrdersListRowView[];
  empty?: EmptyState;
};

export type OrdersListSnapshot = {
  roles: readonly string[];
  status?: string;
  /** The filtered customer's name; an empty list then names it instead of saying "No orders yet". */
  customer?: string;
  orders: {
    id: string;
    order_no: number | null;
    status: OrderStatus;
    requested_ship_date: string | null;
    needs_restock: boolean;
    customers: { name: string } | null;
  }[];
};

export function toOrdersListViewProps({ roles, status, customer, orders }: OrdersListSnapshot): OrdersListViewModel {
  const what = status ? `${status} orders` : "orders";
  const title = customer ? `No ${what} for ${customer}` : status ? `No ${what}` : "No orders yet";
  return {
    empty: orders.length === 0 ? { title, description: "Orders appear here once they are placed." } : undefined,
    rows: orders.map((o) => {
      const { verb, tone, href } = nextAction(o.status, o.needs_restock, o.id, roles);
      const ships = o.requested_ship_date ? ` · ships ${formatDate(o.requested_ship_date)}` : "";
      const restock = o.needs_restock ? " · restock staged" : "";
      return {
        key: o.id,
        title: `${docNo("ORD", o.order_no, "Order")} · ${o.customers?.name ?? "transfer"}`,
        detail: `${o.status}${ships}${restock}`,
        verb,
        tone,
        href,
        warning: o.needs_restock,
      };
    }),
  };
}
