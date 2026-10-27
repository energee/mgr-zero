// lib/mgr/order-status.ts — what an order in a given state is called and what
// happens to it next, in one place. Three surfaces asked the same question and
// drifted: the staff list offers a verb, the order page names the next
// lifecycle step, and the portal says it in buyer words. Staged beer outranks
// the lifecycle everywhere, so the restock override lives here too rather than
// in each caller.
import { formatDate } from "@/lib/date-format";
import { hasAnyRole } from "@/lib/mgr/roles";
import { sentenceCase } from "@/lib/mgr/labels";

/** Every lifecycle state in order, so a status filter cannot drift from the type. */
export const ORDER_STATUSES = ["draft", "submitted", "confirmed", "picked", "shipped", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type ActionTone = "primary" | "success" | "info" | "attention";

/** The Orders Status filter: the lifecycle plus Delivered, which orders.status
 *  never holds (#1483). list_orders matches it on the order's delivery stop. */
export const ORDER_FILTERS = ["draft", "submitted", "confirmed", "picked", "shipped", "delivered", "cancelled"] as const;
export type OrderFilter = (typeof ORDER_FILTERS)[number];

/** Unknown or repeated URL statuses mean All states, never an invalid list_orders filter. */
export function parseOrderStatus(value: string | string[] | undefined): OrderFilter | undefined {
  return ORDER_FILTERS.find((status) => status === value);
}

/** verb, tone, and the path under the order that finishes it. */
const ACTION: Record<OrderStatus, [string, ActionTone, string]> = {
  draft: ["Finish", "primary", ""], submitted: ["Confirm", "success", "/confirm"],
  confirmed: ["Pick", "info", "/pick"], picked: ["Ship", "info", "/ship"],
  shipped: ["Open", "primary", ""], cancelled: ["Open", "primary", ""],
};

/** Who may run the order commands. lib/commands/orders.ts gates each command
 * with these lists; they live here, a pure module, so client screens can ask
 * the same question without importing server command code. */
export const salesRoles = ["admin", "sales"] as const;
export const warehouseRoles = ["admin", "warehouse"] as const;

/** Staged beer waits for Put back on a picked order, and on a confirmed one a
 * mixed adjust sent back for a re-pick (#811): put back first, then count. */
export const stagedOnOpenOrder = (status: OrderStatus, needsRestock: boolean) =>
  needsRestock && (status === "picked" || status === "confirmed");

/** The verb a staff list offers on this order, and the page that does it
 * (#1503). Only a role the next step's command allows gets the verb; anyone
 * else gets Open. A picked taproom transfer completes rather than ships. */
export function nextAction(status: OrderStatus, needsRestock: boolean, id: string, heldRoles: readonly string[], transfer = false): { verb: string; tone: ActionTone; href: string } {
  const roles = status === "draft" || status === "submitted" ? salesRoles : warehouseRoles;
  if (!hasAnyRole(heldRoles, roles)) return { verb: "Open", tone: "primary", href: `/orders/${id}` };
  if (stagedOnOpenOrder(status, needsRestock)) return { verb: "Put back", tone: "attention", href: `/orders/${id}/restock` };
  if (status === "picked" && transfer) return { verb: "Complete transfer", tone: "info", href: `/orders/${id}/complete` };
  const [verb, tone, path] = ACTION[status];
  return { verb, tone, href: `/orders/${id}${path}` };
}

const NEXT_STATE: Record<OrderStatus, string> = {
  draft: "submit", submitted: "confirm", confirmed: "pick", picked: "ship", shipped: "delivered or returned", cancelled: "none",
};

/** What the next lifecycle step is called, for the order page's state row. */
export const nextState = (status: OrderStatus, needsRestock: boolean) =>
  (stagedOnOpenOrder(status, needsRestock) ? "put back" : NEXT_STATE[status]);

/** What a delivery stop recorded; deliveries.outcome. */
export type DeliveryOutcome = "delivered" | "partial" | "refused";
const OUTCOME: Record<DeliveryOutcome, string> = { delivered: "Delivered", partial: "Partly delivered", refused: "Refused" };

/** The state and next step staff read (#1483). orders.status stops at shipped,
 *  so a closed delivery stop names what happened there. A closed stop or a
 *  shipped pickup (which never gets a stop) has no next step. */
export function shownState(status: OrderStatus, needsRestock: boolean, outcome: DeliveryOutcome | null, pickup: boolean): { label: string; next: string } {
  if (status === "shipped" && outcome) return { label: OUTCOME[outcome], next: "none" };
  if (status === "shipped" && pickup) return { label: "Shipped", next: "none" };
  return { label: sentenceCase(status), next: nextState(status, needsRestock) };
}

/** Buyer wording: the portal never prints a staff lifecycle word. */
const BUYER: Record<OrderStatus, string> = {
  draft: "Draft", submitted: "Placed", confirmed: "Confirmed", picked: "Being picked", shipped: "Shipped", cancelled: "Cancelled",
};

/** "Placed · ships Sep 10, 2026" — the one line both portal order surfaces
 *  print. requested_ship_date is a date column, so it needs no time zone. */
export const buyerStatus = (status: string, requestedShipDate?: string | null) =>
  `${BUYER[status as OrderStatus] ?? status}${requestedShipDate ? ` · ships ${formatDate(requestedShipDate)}` : ""}`;
