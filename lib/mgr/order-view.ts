// lib/mgr/order-view.ts — the Order screen's view-model: one shape for the
// inventory mock and for get_order. Mapping lives here so the page does not
// compose a second E.* tree.
import type { ReactNode } from "react";
import { docNo } from "./doc-no";
import { money } from "./money";
import { shipToAddress } from "./ship-to-view";
import { nextState, stagedOnOpenOrder, type OrderStatus } from "./order-status";
import { formatDateTime } from "@/lib/date-format";
import { stagedQty } from "./put-back-view";
import type { OrderCogs } from "@/lib/commands/orders";

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
  /** Collected at the brewery: never routed (orders.pickup). */
  pickup: boolean;
  customerPo?: string;
  requested?: string;
  note?: string;
  /** "$X · margin Y%" for a shipped order, when the caller may run get_order_cogs (#810). */
  costLine?: string;
  restockNote?: string;
  /** Set while a picked order awaits the re-pick of lines changed after it was picked (#811). */
  repickNote?: string;
  putBackHref?: string;
  confirmHref?: string;
  editHref?: string;
  completeHref?: string;
  lines: OrderLineView[];
  events: [ReactNode, ReactNode?][];
};

export type OrderSnapshot = {
  backHref?: string;
  /** breweries.timezone: event times print in it (#442). */
  timeZone: string;
  order: {
    id: string;
    order_no: number | null;
    kind: "wholesale" | "taproom_transfer";
    status: OrderStatus;
    po_number: string | null;
    requested_ship_date: string | null;
    note: string | null;
    needs_restock: boolean;
    pickup?: boolean;
    /** orders.repick_since: when an adjustment sent a picked order back to confirmed (#811). */
    repick_since?: string | null;
    from_location_id?: string;
    customers: { name: string } | null;
    ship_tos: { label: string; country: string; city: string | null; state: string | null } | null;
  };
  locations?: { id: string; name: string }[];
  lines: {
    id: string;
    sku_id: string;
    qty_ordered: number;
    qty_picked: number | null;
    qty_shipped: number | null;
    unit_price_cents: number;
    short_reason?: string | null;
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
  /** get_order_cogs, passed only for roles that may run it. */
  cogs?: OrderCogs;
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
  shortReason?: string | null,
): string {
  const bits = [`ordered ${ordered}`];
  if (picked !== null) bits.push(`picked ${picked}`);
  if (shipped !== null) bits.push(`shipped ${shipped}`);
  bits.push(`${money(unitPriceCents)} each`);
  if (atp !== undefined) bits.push(`ATP ${atp}`);
  if (shortReason) bits.push(`short: ${shortReason}`);
  return bits.join(" · ");
}

function restockNoteFor(order: OrderSnapshot["order"], lines: OrderSnapshot["lines"]): string | undefined {
  if (!order.needs_restock) return undefined;
  const bits = lines.flatMap((l) => {
    const extra = stagedQty(order.status, l);
    return extra > 0 ? [`${extra} ${l.skus?.name ?? "line"}`] : [];
  });
  if (!bits.length) return "Staged beer stayed on the floor after this order changed.";
  return `Put back ${bits.join(", ")}. They stayed staged after the order changed.`;
}

/** Cost, then margin; with uncosted units the margin is withheld and the gap named, so a partial cost never reads as a full one. */
function costLineFor(order: OrderSnapshot["order"], cogs?: OrderCogs): string | undefined {
  if (!cogs || order.status !== "shipped") return undefined;
  if (cogs.uncosted_qty > 0) return `${money(cogs.cost_cents)} · ${cogs.uncosted_qty} units without cost, margin withheld`;
  return cogs.margin_pct === null ? money(cogs.cost_cents) : `${money(cogs.cost_cents)} · margin ${cogs.margin_pct}%`;
}

/** Map a get_order payload onto OrderView's model. Inventory frames pass a
 *  fixture snapshot through this same function. */
export function toOrderViewProps({ order, lines, events, atp, locations, backHref, timeZone, cogs }: OrderSnapshot): OrderViewModel {
  const atpMap = new Map(atp.map((a) => [a.sku_id, Number(a.qty)]));
  const skuNames = new Map(lines.map((l) => [l.sku_id, l.skus?.name ?? "line"]));
  const where = order.customers
    ? [order.customers.name, order.ship_tos && shipToAddress(order.ship_tos)].filter(Boolean).join(" · ")
    : "Taproom transfer";
  return {
    backHref,
    title: docNo("ORD", order.order_no, "Order"),
    where,
    currentState: `${titled(order.status)}${order.needs_restock ? " · restock pending" : ""}`,
    next: `Next: ${nextState(order.status, order.needs_restock)}`,
    fulfillmentSource: order.from_location_id
      ? locations?.find((l) => l.id === order.from_location_id)?.name
      : undefined,
    shipTo: order.ship_tos?.label,
    pickup: Boolean(order.pickup),
    customerPo: order.po_number ?? undefined,
    requested: order.requested_ship_date ?? undefined,
    note: order.note ?? undefined,
    costLine: costLineFor(order, cogs),
    restockNote: restockNoteFor(order, lines),
    repickNote: order.repick_since && order.status === "confirmed" ? "Changed after pick: count the added or raised lines; the rest is already staged." : undefined,
    putBackHref: stagedOnOpenOrder(order.status, order.needs_restock) ? (backHref ? `/orders/${order.id}/restock` : "#") : undefined,
    editHref: order.status === "draft" ? (backHref ? `/orders/${order.id}/edit` : "#") : undefined,
    confirmHref: order.status === "submitted" ? (backHref ? `/orders/${order.id}/confirm` : "#") : undefined,
    completeHref: order.status === "picked" && order.kind === "taproom_transfer" ? (backHref ? `/orders/${order.id}/complete` : "#") : undefined,
    lines: lines.map((l) => {
      const ordered = Number(l.qty_ordered);
      const picked = l.qty_picked === null ? null : Number(l.qty_picked);
      const shipped = l.qty_shipped === null ? null : Number(l.qty_shipped);
      const qtyAtp = atpMap.get(l.sku_id);
      return {
        key: l.id,
        name: l.skus?.name ?? "Line",
        detail: lineDetail(ordered, picked, shipped, Number(l.unit_price_cents), qtyAtp, l.short_reason),
        tone: lineTone(picked, ordered, qtyAtp),
      };
    }),
    events: events.map((e) => [
      `${formatDateTime(e.created_at, timeZone)} · ${e.event.replace(/_/g, " ")}`,
      e.event === "lines_adjusted"
        ? `${lineChange(e.payload.before, skuNames)} to ${lineChange(e.payload.lines, skuNames)}${typeof e.payload.reason === "string" ? ` (${e.payload.reason})` : ""}`
        : typeof e.payload.reason === "string" ? e.payload.reason : "",
    ]),
  };
}
