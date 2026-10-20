// lib/mgr/order-status.ts — what an order in a given state is called and what
// happens to it next, in one place. Three surfaces asked the same question and
// drifted: the staff list offers a verb, the order page names the next
// lifecycle step, and the portal says it in buyer words. Staged beer outranks
// the lifecycle everywhere, so the restock override lives here too rather than
// in each caller.
import { formatDate } from "@/lib/date-format";
import { hasAnyRole } from "@/lib/mgr/roles";

export type OrderStatus = "draft" | "submitted" | "confirmed" | "picked" | "shipped" | "cancelled";
export type ActionTone = "primary" | "success" | "info" | "attention";

/** verb, tone, and the path under the order that finishes it. */
const ACTION: Record<OrderStatus, [string, ActionTone, string]> = {
  draft: ["Finish", "primary", ""], submitted: ["Confirm", "success", "/confirm"],
  confirmed: ["Pick", "info", ""], picked: ["Ship", "info", ""],
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

/** The verb a staff list offers on this order, and where it goes. Only a role
 * the next step's command allows gets the verb; anyone else gets Open. */
export function nextAction(status: OrderStatus, needsRestock: boolean, id: string, heldRoles: readonly string[]): { verb: string; tone: ActionTone; href: string } {
  const roles = status === "draft" || status === "submitted" ? salesRoles : warehouseRoles;
  if (!hasAnyRole(heldRoles, roles)) return { verb: "Open", tone: "primary", href: `/orders/${id}` };
  if (stagedOnOpenOrder(status, needsRestock)) return { verb: "Put back", tone: "attention", href: `/orders/${id}/restock` };
  const [verb, tone, path] = ACTION[status];
  return { verb, tone, href: `/orders/${id}${path}` };
}

const NEXT_STATE: Record<OrderStatus, string> = {
  draft: "submit", submitted: "confirm", confirmed: "pick", picked: "ship", shipped: "delivered or returned", cancelled: "none",
};

/** What the next lifecycle step is called, for the order page's state row. */
export const nextState = (status: OrderStatus, needsRestock: boolean) =>
  (stagedOnOpenOrder(status, needsRestock) ? "put back" : NEXT_STATE[status]);

/** Buyer wording: the portal never prints a staff lifecycle word. */
const BUYER: Record<OrderStatus, string> = {
  draft: "Draft", submitted: "Placed", confirmed: "Confirmed", picked: "Being picked", shipped: "Shipped", cancelled: "Cancelled",
};

/** "Placed · ships Sep 10, 2026" — the one line both portal order surfaces
 *  print. requested_ship_date is a date column, so it needs no time zone. */
export const buyerStatus = (status: string, requestedShipDate?: string | null) =>
  `${BUYER[status as OrderStatus] ?? status}${requestedShipDate ? ` · ships ${formatDate(requestedShipDate)}` : ""}`;
