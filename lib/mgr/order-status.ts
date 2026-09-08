// lib/mgr/order-status.ts — what an order in a given state is called and what
// happens to it next, in one place. Three surfaces asked the same question and
// drifted: the staff list offers a verb, the order page names the next
// lifecycle step, and the portal says it in buyer words. Staged beer outranks
// the lifecycle everywhere, so the restock override lives here too rather than
// in each caller.
export type OrderStatus = "draft" | "submitted" | "confirmed" | "picked" | "shipped" | "cancelled";
export type ActionTone = "primary" | "success" | "info" | "attention";

/** verb, tone, and the path under the order that finishes it. */
const ACTION: Record<OrderStatus, [string, ActionTone, string]> = {
  draft: ["Finish", "primary", ""], submitted: ["Confirm", "success", "/confirm"],
  confirmed: ["Pick", "info", ""], picked: ["Ship", "info", ""],
  shipped: ["Open", "primary", ""], cancelled: ["Open", "primary", ""],
};

/** The verb a staff list offers on this order, and where it goes. */
export function nextAction(status: OrderStatus, needsRestock: boolean, id: string): { verb: string; tone: ActionTone; href: string } {
  if (status === "picked" && needsRestock) return { verb: "Put back", tone: "attention", href: `/orders/${id}/restock` };
  const [verb, tone, path] = ACTION[status];
  return { verb, tone, href: `/orders/${id}${path}` };
}

const NEXT_STATE: Record<OrderStatus, string> = {
  draft: "submit", submitted: "confirm", confirmed: "pick", picked: "ship", shipped: "delivered or returned", cancelled: "none",
};

/** What the next lifecycle step is called, for the order page's state row. */
export const nextState = (status: OrderStatus, needsRestock: boolean) =>
  (status === "picked" && needsRestock ? "put back" : NEXT_STATE[status]);

/** Buyer wording: the portal never prints a staff lifecycle word. */
const BUYER: Record<OrderStatus, string> = {
  draft: "Draft", submitted: "Placed", confirmed: "Confirmed", picked: "Being picked", shipped: "Shipped", cancelled: "Cancelled",
};

/** "Placed · ships 2026-09-10" — the one line both portal order surfaces print. */
export const buyerStatus = (status: string, requestedShipDate?: string | null) =>
  `${BUYER[status as OrderStatus] ?? status}${requestedShipDate ? ` · ships ${requestedShipDate}` : ""}`;
