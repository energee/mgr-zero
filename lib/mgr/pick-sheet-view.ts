// lib/mgr/pick-sheet-view.ts — view-model for Work → Pick sheet.
// Groups daily_pick_sheet rows by requested_ship_date the way the live page
// does; weekday chips stay a filters slot, not this mapping. Each date totals
// its lines per SKU, grouped by brand like Pick (brand-lines.ts).
import type { EmptyState } from "./empty-state";
import { formatDate } from "@/lib/date-format";
import { docNo } from "./doc-no";
import { plural } from "./plural";
import { brandLabel, byBrand, type BrandedSku } from "./brand-lines";

export type PickSheetRowView = {
  key: string;
  title: string;
  detail: string;
  href: string;
  /** Pick on a confirmed order; any other status has no next action here,
   *  so its row is a plain link to the order (#1026). */
  verb?: "Pick";
  /** Order was changed after pick (#811): count only the added or raised lines. */
  changedAfterPick?: boolean;
};

/** One SKU's ordered quantity across a date's orders. */
export type PickSheetTotalView = { key: string; group?: string; name: string; qty: number };

export type PickSheetGroupView = {
  key: string;
  title: string;
  rows: PickSheetRowView[];
  totals: PickSheetTotalView[];
};

export type PickSheetViewModel = {
  groups: PickSheetGroupView[];
  empty?: EmptyState;
};

export type PickSheetSnapshot = {
  orders: {
    id: string;
    order_no: number | null;
    status: string;
    requested_ship_date: string | null;
    repick_since?: string | null;
    customers: { name: string } | null;
    order_lines: {
      id: string;
      sku_id: string;
      qty_ordered: number;
      qty_picked: number | null;
      skus: BrandedSku;
    }[];
  }[];
};

export function toPickSheetViewProps({ orders }: PickSheetSnapshot): PickSheetViewModel {
  if (orders.length === 0) {
    return { groups: [], empty: { title: "Nothing confirmed to pick", description: "Confirm an order to add its lines to the pick sheet." } };
  }
  const grouped = Map.groupBy(orders, (o) => o.requested_ship_date ?? "Unscheduled");
  return {
    groups: [...grouped].map(([shipDate, group]) => {
      const totals = new Map<string, { skus: BrandedSku; qty: number }>();
      const rows = group.map((o) => {
        for (const l of o.order_lines) {
          const total = totals.get(l.sku_id) ?? { skus: l.skus, qty: 0 };
          totals.set(l.sku_id, { ...total, qty: total.qty + Number(l.qty_ordered) });
        }
        return {
          key: o.id,
          title: `${o.customers?.name ?? "Transfer"} · ${docNo("ORD", o.order_no, "Order")}`,
          detail: `${o.status} · ${plural(o.order_lines.length, "line")}`,
          href: `/orders/${o.id}`,
          verb: o.status === "confirmed" ? "Pick" as const : undefined,
          changedAfterPick: o.repick_since ? true : undefined,
        };
      });
      return {
        key: shipDate,
        title: shipDate === "Unscheduled" ? shipDate : formatDate(shipDate),
        rows,
        totals: byBrand([...totals].map(([key, t]) => ({ key, ...t }))).map((t) => ({ key: t.key, ...brandLabel(t.skus), qty: t.qty })),
      };
    }),
  };
}
