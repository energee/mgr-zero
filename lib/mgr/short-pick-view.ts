// lib/mgr/short-pick-view.ts — view-model for one Short pick line.
import { docNo } from "./doc-no";

export type ShortPickViewModel = {
  backTo: string;
  backHref?: string;
  title: string;
  source: string;
  lineName: string;
  orderedLabel: string;
  counted: number;
  ordered: number;
  missing: number;
  resolveTitle: string;
  chips: string[];
  verb: string;
};

export type ShortPickSnapshot = {
  backHref?: string;
  order: {
    id: string;
    order_no: number | null;
    from_location_id: string;
    customers: { name: string } | null;
  };
  line: {
    id: string;
    sku_id: string;
    qty_ordered: number;
    qty_picked: number | null;
    skus: { name: string } | null;
  };
  locations: { id: string; name: string }[];
};

function unitWord(name: string) {
  if (/case/i.test(name)) return "cases";
  if (/keg/i.test(name)) return "kegs";
  return "units";
}

/** Map get_order + the short line's count onto ShortPickView. */
export function toShortPickViewProps({ order, line, locations, backHref }: ShortPickSnapshot): ShortPickViewModel {
  const name = line.skus?.name ?? "Line";
  const ordered = Number(line.qty_ordered);
  const counted = Number(line.qty_picked ?? 0);
  const missing = Math.max(0, ordered - counted);
  const loc = locations.find((l) => l.id === order.from_location_id)?.name ?? "—";
  const who = order.customers?.name ?? "Taproom transfer";
  return {
    backTo: "Pick",
    backHref,
    title: `${docNo("ORD", order.order_no, "Order")} · short line`,
    source: `${who} · ${loc}`,
    lineName: name,
    orderedLabel: `ordered ${ordered}`,
    counted,
    ordered,
    missing,
    resolveTitle: `Resolve the missing ${missing}`,
    chips: [`Adjust order to ${counted}`, `Keep ${missing} owed · staged`],
    verb: `Adjust order to ${counted} ${unitWord(name)}`,
  };
}
