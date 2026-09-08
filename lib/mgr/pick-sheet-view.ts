// lib/mgr/pick-sheet-view.ts — view-model for Work → Pick sheet.
// Groups daily_pick_sheet rows by requested_ship_date the way the live page
// does; weekday chips stay a filters slot, not this mapping.
import { docNo } from "./doc-no";
import { plural } from "./plural";

export type PickSheetRowView = {
  key: string;
  title: string;
  detail: string;
  href: string;
};

export type PickSheetGroupView = {
  key: string;
  title: string;
  rows: PickSheetRowView[];
  totals: string;
};

export type PickSheetViewModel = {
  groups: PickSheetGroupView[];
  empty?: string;
};

export type PickSheetSnapshot = {
  orders: {
    id: string;
    order_no: number | null;
    status: string;
    requested_ship_date: string | null;
    customers: { name: string } | null;
    order_lines: {
      id: string;
      sku_id: string;
      qty_ordered: number;
      qty_picked: number | null;
      skus: { name: string } | null;
    }[];
  }[];
};

export function toPickSheetViewProps({ orders }: PickSheetSnapshot): PickSheetViewModel {
  if (orders.length === 0) {
    return { groups: [], empty: "Nothing confirmed to pick" };
  }
  const grouped = Map.groupBy(orders, (o) => o.requested_ship_date ?? "Unscheduled");
  return {
    groups: [...grouped].map(([shipDate, group]) => {
      const totals = new Map<string, number>();
      const rows = group.map((o) => {
        for (const l of o.order_lines) {
          const name = l.skus?.name ?? "Line";
          totals.set(name, (totals.get(name) ?? 0) + Number(l.qty_ordered));
        }
        return {
          key: o.id,
          title: `${o.customers?.name ?? "Transfer"} · ${docNo("ORD", o.order_no, "Order")}`,
          detail: plural(o.order_lines.length, "line"),
          href: `/orders/${o.id}`,
        };
      });
      return {
        key: shipDate,
        title: shipDate,
        rows,
        totals: [...totals].map(([name, qty]) => `${name} ${qty}`).join(" · "),
      };
    }),
  };
}
