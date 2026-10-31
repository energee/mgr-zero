// lib/mgr/order-view.ts — the Order screen's view-model: one shape for the
// inventory mock and for get_order. Mapping lives here so the page does not
// compose a second E.* tree. It also owns the order's price summary: line
// amounts and the before-tax order amount, from the order's own frozen facts.
import { docNo } from "./doc-no";
import { money } from "./money";
import { shipToAddress } from "./ship-to-view";
import { shownState, stagedOnOpenOrder, type DeliveryOutcome, type OrderStatus } from "./order-status";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { stagedQty } from "./put-back-view";
import type { OrderCogs } from "@/lib/commands/orders";
import type { PriceSummaryModel } from "@/components/mgr/views/price-summary";
import { plural } from "./plural";

export type OrderLineView = {
  key: string;
  name: string;
  /** Display quantities: a decimal stays a decimal, null reads "Not recorded" (never 0). */
  ordered: string;
  picked: string;
  shipped: string;
  /** Brewery-wide ATP; "Not supplied" when get_order returned none (never 0). */
  atp: string;
  unitPrice: string;
  /** Ordered quantity × captured price, rounded to the cent. */
  amount: string;
  shortReason?: string;
  /** The line's problem in words, so the tone dot is never the only signal. */
  warning?: string;
};

/** The line table's number columns, in order; Line amount always follows. */
const LINE_COLUMNS = [["Ordered", "ordered"], ["Picked", "picked"], ["Shipped", "shipped"], ["Available (all locations)", "atp"], ["Unit price", "unitPrice"]] as const;
export type OrderLineColumn = (typeof LINE_COLUMNS)[number];

export type OrderViewModel = {
  backHref?: string;
  title: string;
  /** The customer's name, or "Taproom transfer". */
  customer: string;
  kind: "Wholesale" | "Taproom transfer";
  currentState: string;
  stateTone: "ok" | "w" | "";
  next: string;
  /** breweries.timezone, named under the history. */
  timeZone: string;
  /** Order details, in order; a fixed fact with no value reads "Not specified". The note is `wide`.
   *  A shipped order's Invoice links on the live page. */
  facts: { label: string; value: string; wide?: boolean; href?: string }[];
  summary: PriceSummaryModel;
  /** "$X · margin Y%" for a shipped order, when the caller may run get_order_cogs (#810). */
  costLine?: string;
  restockNote?: string;
  /** Set while a picked order awaits the re-pick of lines changed after it was picked (#811). */
  repickNote?: string;
  putBackHref?: string;
  confirmHref?: string;
  editHref?: string;
  /** A shipped wholesale order with refused quantities offers Reorder once: a reorder_created event retires it (#1662). */
  canReorderRefused?: boolean;
  lines: OrderLineView[];
  /** The columns with something to say (#1506): Picked and Shipped once a line
   *  records them, Available while the order still waits on stock. */
  columns: OrderLineColumn[];
  /** Keg deposits and one-way keg fees, frozen on the order at submit, each named with its line. */
  kegCharges: { key: string; name: string; detail: string; amount: string }[];
  /** `by` names the actor when the page passed actorNames. */
  events: { key: string; at: string; event: string; by?: string; detail: string }[];
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
  /** The order's delivery stop outcome; null while the stop is open or there is none. */
  deliveryOutcome?: DeliveryOutcome | null;
  /** The invoice billing the order's shipment; null until one is issued. */
  invoice?: { id: string; invoice_no: number | null } | null;
  lines: {
    id: string;
    sku_id: string;
    qty_ordered: number;
    qty_picked: number | null;
    qty_shipped: number | null;
    qty_refused?: number;
    unit_price_cents: number;
    short_reason?: string | null;
    /** Set at submit on a one-way keg line (order_lines.one_way_fee_cents). */
    one_way_fee_cents?: number | null;
    skus: { name: string } | null;
  }[];
  /** order_deposit_lines, one per returnable keg line. */
  deposits?: { order_line_id: string; description: string; qty_ordered: number; unit_price_cents: number; amount_cents: number }[];
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
  /** Admin/Sales-only confirmation diagnostics; undefined means the caller may not read them. */
  emailStatuses?: { state: "pending" | "sending" | "accepted" | "blocked" | "suppressed"; last_error: string | null }[];
  /** Display name by user id: staff names (list_team_members) and the
   *  customer's portal emails (list_customer_users). An actor in neither, such
   *  as revoked staff, reads "a user not on the team". */
  actorNames?: Record<string, string>;
};

const titled = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);

function lineChange(entries: unknown, skuNames: Map<string, string>): string {
  if (!entries) return "—";
  const arr = Array.isArray(entries)
    ? (entries as { sku_id: string; qty: number }[]).map((l) => [l.sku_id, l.qty] as const)
    : Object.entries(entries as Record<string, number>);
  return arr.map(([skuId, qty]) => `${skuNames.get(skuId) ?? "line"} ${qty}`).join(", ");
}

function lineWarning(picked: number | null, ordered: number, atp?: number): string | undefined {
  if (picked !== null && picked > ordered) return `Picked ${picked}, more than ordered`;
  if (atp !== undefined && atp < 0) return "Available is below zero";
  return undefined;
}

/** Availability matters until the order is picked: before submit nothing is
 *  promised, and once picked or shipped the stock is already counted out. */
const awaitsStock = (status: OrderStatus) => status === "submitted" || status === "confirmed";

/** A picked quantity can outlive the picked state (re-opened to confirmed by
 *  an adjustment, or cancelled), so Picked and Shipped follow the lines. */
function lineColumns(status: OrderStatus, lines: OrderSnapshot["lines"]): OrderLineColumn[] {
  const shows = { picked: lines.some((l) => l.qty_picked !== null), shipped: lines.some((l) => l.qty_shipped !== null), atp: awaitsStock(status) };
  return LINE_COLUMNS.filter(([, field]) => field === "ordered" || field === "unitPrice" || shows[field]);
}

const qtyText = (qty: number | null) => (qty === null ? "Not recorded" : String(qty));

/** qty × cents rounded to the nearest cent, half up, the way the database
 *  rounds a numeric line amount. qty is numeric(12,2), so it is scaled to
 *  whole hundredths first: the product stays an exact integer, where a float
 *  product (1.15 × 50 = 57.4999…) would round the wrong way.
 *  ponytail: exact only while hundredths × cents stays under 2^53 (about
 *  9×10^15, e.g. 1,000,000 units at $900,000 each); no order comes near it. */
export function orderLineCents(qty: number, unitCents: number): number {
  const hundredths = Math.round(Number(qty) * 100) * Number(unitCents);
  return Math.floor((hundredths + 50) / 100);
}

/** The order's money summary: the before-tax order amount for a submitted
 *  wholesale order, an items estimate for a draft (or a draft cancelled before
 *  it was ever submitted, since keg charges freeze at submit), nothing payable
 *  for a transfer. A total needs every charge collection; an undefined
 *  deposits list or line fee means it was not supplied, which is not the same
 *  as none. */
function orderSummary(
  order: OrderSnapshot["order"],
  lines: OrderSnapshot["lines"],
  deposits: OrderSnapshot["deposits"],
  events: OrderSnapshot["events"],
): PriceSummaryModel {
  if (order.kind === "taproom_transfer") return { rows: [], note: "Taproom transfer · not a customer charge. No invoice or balance due." };
  const itemsCents = lines.reduce((sum, l) => sum + orderLineCents(l.qty_ordered, l.unit_price_cents), 0);
  const items = money(itemsCents);
  const neverSubmitted = order.status === "draft" || (order.status === "cancelled" && !events.some((e) => e.event === "submitted"));
  if (neverSubmitted) {
    return {
      rows: [{ label: "Keg deposits and fees", value: "Not finalized until submission" }],
      total: { label: "Items estimate", value: items },
      note: "Saved lines at their captured prices. Keg deposits and one-way fees are set when the order is submitted.",
    };
  }
  if (!deposits || lines.some((l) => l.one_way_fee_cents === undefined)) {
    return { rows: [{ label: "Ordered items", value: items }], note: "Order amount unavailable: complete charge and line data required." };
  }
  const depositCents = deposits.reduce((sum, d) => sum + Number(d.amount_cents), 0);
  const feeCents = lines.reduce((sum, l) => sum + (l.one_way_fee_cents ? orderLineCents(l.qty_ordered, l.one_way_fee_cents) : 0), 0);
  const total = money(itemsCents + depositCents + feeCents);
  const rows = [
    { label: "Ordered items", value: items },
    { label: "Returnable keg deposits", value: money(depositCents) },
    { label: "One-way keg fees", value: money(feeCents) },
  ];
  if (order.status === "cancelled") {
    return { rows, total: { label: "Cancelled order amount · before tax", value: total }, note: "What the order came to when it was cancelled: history, not an amount to collect." };
  }
  if (order.status === "shipped") {
    return { rows, total: { label: "Order amount · before tax", value: total }, note: "Ordered quantities; not final invoiced amount. The invoice bills what shipped; tax is not included here." };
  }
  return { rows, total: { label: "Order amount · before tax", value: total }, note: "Ordered quantities and captured charges. Not an invoice or balance due. The shipped / invoiced amount can differ; tax is not included here." };
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
  if (cogs.uncosted_qty > 0) return `${money(cogs.cost_cents)} · ${plural(cogs.uncosted_qty, "unit")} without cost, margin withheld`;
  return cogs.margin_pct === null ? money(cogs.cost_cents) : `${money(cogs.cost_cents)} · margin ${cogs.margin_pct}%`;
}

/** Summarize every buyer's saved delivery state without claiming inbox delivery. */
function emailStatusLine(statuses: NonNullable<OrderSnapshot["emailStatuses"]>): string {
  if (!statuses.length) return "No confirmation email recorded";
  const labels = { pending: "Queued", sending: "Sending", accepted: "Accepted by provider (not proof of inbox delivery)", blocked: "Blocked", suppressed: "Suppressed" };
  const reasons: Record<string, string> = {
    provider_uncertain: "provider outcome uncertain",
    provider_rejected: "provider rejected the email",
    retry_window_expired: "retry window expired; investigate before resending",
    no_recipient: "no linked portal buyer",
    recipient_changed: "buyer removed or email changed",
  };
  const counts = new Map<string, number>();
  for (const status of statuses) {
    const label = status.state === "pending" && status.last_error === "provider_uncertain" ? "Retry pending" : labels[status.state];
    const reason = status.last_error && reasons[status.last_error];
    const text = reason ? `${label}: ${reason}` : label;
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return [...counts].map(([text, count]) => `${count} × ${text}`).join(" · ");
}

/** Map a get_order payload onto OrderView's model. Inventory frames pass a
 *  fixture snapshot through this same function. */
export function toOrderViewProps({ order, lines, events, atp, locations, deliveryOutcome, invoice, backHref, timeZone, cogs, deposits, actorNames, emailStatuses }: OrderSnapshot): OrderViewModel {
  const atpMap = new Map(atp.map((a) => [a.sku_id, Number(a.qty)]));
  const skuNames = new Map(lines.map((l) => [l.sku_id, l.skus?.name ?? "line"]));
  const lineNames = new Map(lines.map((l) => [l.id, l.skus?.name ?? "Line"]));
  const source = order.from_location_id ? locations?.find((l) => l.id === order.from_location_id)?.name : undefined;
  const state = shownState(order.status, order.needs_restock, deliveryOutcome ?? null, Boolean(order.pickup));
  const shipTo = order.pickup ? "Pickup" : order.ship_tos ? [order.ship_tos.label, shipToAddress(order.ship_tos)].filter(Boolean).join(" · ") : undefined;
  return {
    backHref,
    title: docNo("ORD", order.order_no, "Order"),
    customer: order.customers?.name ?? "Taproom transfer",
    kind: order.kind === "taproom_transfer" ? "Taproom transfer" : "Wholesale",
    currentState: `${state.label}${order.needs_restock ? " · restock pending" : ""}`,
    stateTone: order.needs_restock ? "w" : order.status === "cancelled" ? "" : "ok",
    next: `Next: ${state.next}`,
    timeZone,
    facts: [
      { label: "Fulfillment source", value: source ?? "Not specified" },
      // A transfer has no ship-to; its destination is not on this read, so it is left out rather than guessed.
      ...(order.kind === "wholesale" || order.pickup ? [{ label: "Ship-to", value: shipTo ?? "Not specified" }] : []),
      { label: "Requested ship date", value: order.requested_ship_date ? formatDate(order.requested_ship_date) : "Not specified" },
      ...(order.kind === "wholesale" ? [{ label: "Customer PO", value: order.po_number?.trim() || "Not specified" }] : []),
      ...(invoice ? [{ label: "Invoice", value: docNo("INV", invoice.invoice_no, "Invoice"), ...(backHref ? { href: `/invoices/${invoice.id}` } : {}) }] : []),
      ...(order.kind === "wholesale" && emailStatuses !== undefined ? [{ label: "Confirmation email", value: emailStatusLine(emailStatuses), wide: true }] : []),
      ...(order.note ? [{ label: "Note", value: order.note, wide: true }] : []),
    ],
    summary: orderSummary(order, lines, deposits, events),
    costLine: costLineFor(order, cogs),
    restockNote: restockNoteFor(order, lines),
    repickNote: order.repick_since && order.status === "confirmed" ? "Changed after pick: count the added or raised lines; the rest is already staged." : undefined,
    putBackHref: stagedOnOpenOrder(order.status, order.needs_restock) ? (backHref ? `/orders/${order.id}/restock` : "#") : undefined,
    editHref: order.status === "draft" ? (backHref ? `/orders/${order.id}/edit` : "#") : undefined,
    confirmHref: order.status === "submitted" ? (backHref ? `/orders/${order.id}/confirm` : "#") : undefined,
    canReorderRefused: order.kind === "wholesale" && order.status === "shipped" && lines.some(line => Number(line.qty_refused ?? 0) > 0)
      && !events.some((e) => e.event === "reorder_created"),
    columns: lineColumns(order.status, lines),
    lines: lines.map((l) => {
      const ordered = Number(l.qty_ordered);
      const picked = l.qty_picked === null ? null : Number(l.qty_picked);
      const shipped = l.qty_shipped === null ? null : Number(l.qty_shipped);
      const qtyAtp = atpMap.get(l.sku_id);
      return {
        key: l.id,
        name: l.skus?.name ?? "Line",
        ordered: qtyText(ordered),
        picked: qtyText(picked),
        shipped: qtyText(shipped),
        atp: qtyAtp === undefined ? "Not supplied" : String(qtyAtp),
        unitPrice: money(Number(l.unit_price_cents)),
        amount: money(orderLineCents(ordered, l.unit_price_cents)),
        shortReason: l.short_reason ?? undefined,
        warning: lineWarning(picked, ordered, awaitsStock(order.status) ? qtyAtp : undefined),
      };
    }),
    kegCharges: [
      ...(deposits ?? []).map((d) => ({ key: `deposit-${d.order_line_id}`, name: `${d.description} · ${lineNames.get(d.order_line_id) ?? "Line"}`,
        detail: `${Number(d.qty_ordered)} × ${money(d.unit_price_cents)} · captured on the order`, amount: money(Number(d.amount_cents)) })),
      ...lines.filter((l) => l.one_way_fee_cents).map((l) => ({ key: `fee-${l.id}`, name: `One-way keg fee · ${l.skus?.name ?? "Line"}`,
        detail: `${Number(l.qty_ordered)} × ${money(l.one_way_fee_cents!)} · captured on the order`, amount: money(orderLineCents(l.qty_ordered, l.one_way_fee_cents!)) })),
    ],
    events: events.map((e) => {
      const reason = typeof e.payload.reason === "string" ? e.payload.reason.trim() : "";
      let detail = reason;
      if (e.event === "lines_adjusted") {
        detail = `${lineChange(e.payload.before, skuNames)} to ${lineChange(e.payload.lines, skuNames)}${reason ? ` (${reason})` : ""}`;
      } else if (e.event === "pickup_changed") {
        detail = e.payload.pickup ? "Delivery to pickup" : "Pickup to delivery";
      } else if (e.event === "reorder_created") {
        detail = docNo("ORD", typeof e.payload.order_no === "number" ? e.payload.order_no : null, "Draft");
      }
      return {
        key: e.id,
        at: formatDateTime(e.created_at, timeZone),
        event: titled(e.event.replace(/_/g, " ")),
        ...(actorNames ? { by: actorNames[e.actor] ?? "a user not on the team" } : {}),
        detail,
      };
    }),
  };
}
