// lib/mgr/ship-view.ts — view-model for Ship (invoice now and on delivery).
import { docNo } from "./doc-no";

export type ShipLineView = {
  key: string;
  name: string;
  detail: string;
  qty: number;
  tone?: "" | "w" | "ok";
};

export type ShipViewModel = {
  backTo: string;
  backHref?: string;
  title: string;
  fulfillmentSource: string;
  lines: ShipLineView[];
  shortNote?: string;
  invoiceTiming: "now" | "on_delivery";
  tape: [string, string][];
};

export type ShipSnapshot = {
  order: {
    id: string;
    order_no: number | null;
    from_location_id: string;
    ship_tos?: { state: string } | null;
  };
  lines: {
    id: string;
    sku_id: string;
    qty_ordered: number;
    qty_picked: number | null;
    qty_shipped: number | null;
    bbl_per_unit?: number;
    skus: { name: string } | null;
  }[];
  locations: { id: string; name: string }[];
  invoiceTiming?: "now" | "on_delivery";
};

const pickedOf = (l: ShipSnapshot["lines"][number]) => Number(l.qty_picked ?? 0);
const shipOf = (l: ShipSnapshot["lines"][number]) => Number(l.qty_shipped ?? pickedOf(l));

function shortName(name: string, qty: number) {
  if (/hazy/i.test(name)) return "Hazy ½ bbl";
  if (/pils/i.test(name)) return qty === 1 ? "Pils case" : "Pils cases";
  return name;
}

function saleVolume(qty: number, bblPerUnit: number | undefined) {
  // Sale-removal totals in the inventory are two-decimal bbl (2.00 / 0.87 / 0.97).
  // formatVolume would drop the trailing zeros and turn a half-keg total into a glyph.
  return bblPerUnit === undefined ? "" : `${(qty * bblPerUnit).toFixed(2)} bbl`;
}

/** Map get_order plus proposed ship qtys (qty_shipped, else qty_picked). */
export function toShipViewProps({ order, lines, locations, invoiceTiming = "now" }: ShipSnapshot): ShipViewModel {
  const source = locations.find((l) => l.id === order.from_location_id)?.name ?? "—";
  const dest = order.ship_tos?.state ?? "";
  const short = lines.find((l) => shipOf(l) < pickedOf(l));
  const anyShort = Boolean(short);
  const tape: [string, string][] = [];
  for (const l of lines) {
    const qty = shipOf(l);
    if (qty <= 0) continue;
    const name = l.skus?.name ?? "Line";
    tape.push([`−${qty} ${shortName(name, qty)} · sale removal · ${dest}`, saleVolume(qty, l.bbl_per_unit)]);
  }
  if (short) {
    const released = pickedOf(short) - shipOf(short);
    tape.push([`${released} ${shortName(short.skus?.name ?? "line", released)} released · restock`, ""]);
  }
  tape.push(invoiceTiming === "on_delivery"
    ? ["invoice number", "deferred to delivery"]
    : ["invoice number", "assigned on commit"]);
  const shortNameWord = (short?.skus?.name ?? "line").split("·")[0]?.trim() ?? "line";
  return {
    backTo: docNo("ORD", order.order_no, "Order"),
    backHref: `/orders/${order.id}`,
    title: "Ship",
    fulfillmentSource: source,
    lines: lines.map((l) => {
      const ordered = Number(l.qty_ordered);
      const picked = pickedOf(l);
      const qty = shipOf(l);
      return {
        key: l.id,
        name: l.skus?.name ?? "Line",
        detail: anyShort ? `ordered ${ordered} · picked ${picked}` : `picked ${picked}`,
        qty,
        tone: qty < picked ? "w" : "ok",
      };
    }),
    shortNote: short
      ? `Shipping ${shipOf(short)} of ${pickedOf(short)} ${shortNameWord}: the remaining ${pickedOf(short) - shipOf(short)} is cancelled and its allocation released. There is no backorder.`
      : undefined,
    invoiceTiming,
    tape,
  };
}
