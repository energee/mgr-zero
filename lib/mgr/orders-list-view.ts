// lib/mgr/orders-list-view.ts — view-model for the Work → Orders list.
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
  subtitle: string;
  rows: OrdersListRowView[];
  empty?: string;
};

export type OrdersListSnapshot = {
  role: string;
  status?: string;
  orders: {
    id: string;
    order_no: number | null;
    status: OrderStatus;
    requested_ship_date: string | null;
    needs_restock: boolean;
    customers: { name: string } | null;
  }[];
};

export function toOrdersListViewProps({ role, status, orders }: OrdersListSnapshot): OrdersListViewModel {
  return {
    subtitle: `${role} default`,
    empty: orders.length === 0 ? (status ? `No ${status} orders` : "No orders yet") : undefined,
    rows: orders.map((o) => {
      const { verb, tone, href } = nextAction(o.status, o.needs_restock, o.id);
      const ships = o.requested_ship_date ? ` · ships ${o.requested_ship_date}` : "";
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
