// lib/mgr/ship-view.ts — view-model for Ship (invoice now and on delivery).
import { docNo } from "./doc-no";
import { saleVolume } from "@/lib/volume";

export type ShipLineView = {
  key: string;
  name: string;
  detail: string;
  qty: number;
  picked: number;
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
  backHref?: string;
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

/** Map get_order plus proposed ship qtys (qty_shipped, else qty_picked). */
export function toShipViewProps({ order, lines, locations, invoiceTiming = "now", backHref }: ShipSnapshot): ShipViewModel {
  const source = locations.find((l) => l.id === order.from_location_id)?.name ?? "—";
  const dest = order.ship_tos?.state ?? "";
  const anyShort = lines.some((l) => shipOf(l) < pickedOf(l));
  const short = lines.find((l) => shipOf(l) < pickedOf(l));
  const tape: [string, string][] = [];
  for (const l of lines) {
    const qty = shipOf(l);
    if (qty <= 0) continue;
    const name = l.skus?.name ?? "Line";
    tape.push([`−${qty} ${name} · sale removal · ${dest}`, saleVolume(qty, l.bbl_per_unit)]);
  }
  for (const line of lines) {
    const released = pickedOf(line) - shipOf(line);
    if (released > 0) tape.push([`${released} ${line.skus?.name ?? "Line"} released · restock`, ""]);
  }
  tape.push(invoiceTiming === "on_delivery"
    ? ["invoice number", "deferred to delivery"]
    : ["invoice number", "assigned on commit"]);
  const shortNameWord = (short?.skus?.name ?? "line").split("·")[0]?.trim() ?? "line";
  return {
    backTo: docNo("ORD", order.order_no, "Order"),
    backHref,
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
        picked,
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
