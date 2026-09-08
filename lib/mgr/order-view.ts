// lib/mgr/order-view.ts — the Order screen's view-model: one shape for the
// inventory mock and for get_order. Mapping lives here so the page does not
// compose a second E.* tree.
import type { ReactNode } from "react";
import { docNo } from "./doc-no";
import { money } from "./money";
import { nextState, type OrderStatus } from "./order-status";

export type OrderLineView = {
  key: string;
  name: string;
  detail: string;
  tone?: "" | "w" | "ok";
};

export type OrderViewModel = {
  backHref?: string;
  title: string;
  where: string;
  currentState: string;
  next: string;
  fulfillmentSource?: string;
  shipTo?: string;
  customerPo?: string;
  requested?: string;
  note?: string;
  restockNote?: string;
  putBackHref?: string;
  confirmHref?: string;
  completeHref?: string;
  lines: OrderLineView[];
  events: [ReactNode, ReactNode?][];
};

export type OrderSnapshot = {
  order: {
    id: string;
    order_no: number | null;
    kind: "wholesale" | "taproom_transfer";
    status: OrderStatus;
    po_number: string | null;
    requested_ship_date: string | null;
    note: string | null;
    needs_restock: boolean;
    from_location_id?: string;
    customers: { name: string } | null;
    ship_tos: { label: string; city: string; state: string } | null;
  };
  locations?: { id: string; name: string }[];
  lines: {
    id: string;
    sku_id: string;
    qty_ordered: number;
    qty_picked: number | null;
    qty_shipped: number | null;
    unit_price_cents: number;
    skus: { name: string } | null;
  }[];
  events: {
    id: string;
    event: string;
    actor: string;
    payload: Record<string, unknown>;
    created_at: string;
  }[];
  atp: { sku_id: string; qty: number }[];
};

const titled = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);

function lineChange(entries: unknown, skuNames: Map<string, string>): string {
  if (!entries) return "—";
  const arr = Array.isArray(entries)
    ? (entries as { sku_id: string; qty: number }[]).map((l) => [l.sku_id, l.qty] as const)
    : Object.entries(entries as Record<string, number>);
  return arr.map(([skuId, qty]) => `${skuNames.get(skuId) ?? "line"} ${qty}`).join(", ");
}

function lineTone(picked: number | null, ordered: number, atp?: number): OrderLineView["tone"] {
  if (picked !== null && picked > ordered) return "w";
  if (atp !== undefined && atp < 0) return "w";
  if (atp !== undefined) return "ok";
  return "";
}

function lineDetail(
  ordered: number,
  picked: number | null,
  shipped: number | null,
  unitPriceCents: number,
  atp?: number,
): string {
  const bits = [`ordered ${ordered}`];
  if (picked !== null) bits.push(`picked ${picked}`);
  if (shipped !== null) bits.push(`shipped ${shipped}`);
  bits.push(`${money(unitPriceCents)} each`);
  if (atp !== undefined) bits.push(`ATP ${atp}`);
  return bits.join(" · ");
}

function restockNoteFor(order: OrderSnapshot["order"], lines: OrderSnapshot["lines"]): string | undefined {
  if (!order.needs_restock) return undefined;
  const bits = lines.flatMap((l) => {
    const extra = Number(l.qty_picked ?? 0) - Number(l.qty_ordered);
    return extra > 0 ? [`${extra} ${l.skus?.name ?? "line"}`] : [];
  });
  if (!bits.length) return "Staged beer stayed on the floor after this order changed.";
  return `Put back ${bits.join(", ")}. They stayed staged after the line was adjusted.`;
}

/** Map a get_order payload onto OrderView's model. Inventory frames pass a
 *  fixture snapshot through this same function. */
export function toOrderViewProps({ order, lines, events, atp, locations }: OrderSnapshot): OrderViewModel {
  const atpMap = new Map(atp.map((a) => [a.sku_id, Number(a.qty)]));
  const skuNames = new Map(lines.map((l) => [l.sku_id, l.skus?.name ?? "line"]));
  const where = order.customers
    ? `${order.customers.name}${order.ship_tos ? ` · ${order.ship_tos.city}, ${order.ship_tos.state}` : ""}`
    : "Taproom transfer";
  return {
    backHref: "/orders",
    title: docNo("ORD", order.order_no, "Order"),
    where,
    currentState: `${titled(order.status)}${order.needs_restock ? " · restock pending" : ""}`,
    next: `Next: ${nextState(order.status, order.needs_restock)}`,
    fulfillmentSource: order.from_location_id
      ? locations?.find((l) => l.id === order.from_location_id)?.name
      : undefined,
    shipTo: order.ship_tos?.label,
    customerPo: order.po_number ?? undefined,
    requested: order.requested_ship_date ?? undefined,
    note: order.note ?? undefined,
    restockNote: restockNoteFor(order, lines),
    putBackHref: order.status === "picked" && order.needs_restock ? `/orders/${order.id}/restock` : undefined,
    confirmHref: order.status === "submitted" ? `/orders/${order.id}/confirm` : undefined,
    completeHref: order.status === "picked" && order.kind === "taproom_transfer" ? `/orders/${order.id}/complete` : undefined,
    lines: lines.map((l) => {
      const ordered = Number(l.qty_ordered);
      const picked = l.qty_picked === null ? null : Number(l.qty_picked);
      const shipped = l.qty_shipped === null ? null : Number(l.qty_shipped);
      const qtyAtp = atpMap.get(l.sku_id);
      return {
        key: l.id,
        name: l.skus?.name ?? "Line",
        detail: lineDetail(ordered, picked, shipped, Number(l.unit_price_cents), qtyAtp),
        tone: lineTone(picked, ordered, qtyAtp),
      };
    }),
    events: events.map((e) => [
      `${new Date(e.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })} · ${e.event.replace(/_/g, " ")}`,
      e.event === "lines_adjusted"
        ? `${lineChange(e.payload.before, skuNames)} to ${lineChange(e.payload.lines, skuNames)}${typeof e.payload.reason === "string" ? ` (${e.payload.reason})` : ""}`
        : typeof e.payload.reason === "string" ? e.payload.reason : "",
    ]),
  };
}
