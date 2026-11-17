// lib/mgr/order-status.ts — the order lifecycle in one place: its states, which
// command each state accepts (ORDER_MOVES), what a state is called, and what
// happens next. Screens ask here instead of comparing status strings: the staff
// list offers a verb, the order page names the next step, the step pages decide
// whether to open, and the portal says it in buyer words. Staged beer outranks
// the lifecycle everywhere, so the restock override lives here too.
import { formatDate } from "@/lib/date-format";
import { hasAnyRole } from "@/lib/mgr/roles";
import { sentenceCase } from "@/lib/mgr/labels";

/** Every lifecycle state in order, so a status filter cannot drift from the type.
 *  tests/order-status.test.ts pins this to the database's order_status enum. */
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

const UNSHIPPED = ["draft", "submitted", "confirmed", "picked"] as const;

/** The statuses each order command accepts. The SQL function behind the
 *  command passes the same list to private.lock_order and refuses the rest, so
 *  a screen that asks here never offers a step the database turns down. */
export const ORDER_MOVES = {
  update_draft_order: ["draft"],
  submit_order: ["draft"],
  confirm_order: ["submitted"],
  // SQL also accepts submitted; a submitted order's lines change on Review and confirm instead.
  adjust_order_lines: ["confirmed", "picked"],
  record_pick: ["confirmed", "picked"],
  ship_order: ["picked"],
  set_order_pickup: UNSHIPPED,
  cancel_order: UNSHIPPED,
} satisfies Record<string, readonly OrderStatus[]>;
export type OrderMove = keyof typeof ORDER_MOVES;

/** Whether an order in this status accepts the command. */
export const orderAllows = (command: OrderMove, status: OrderStatus) =>
  (ORDER_MOVES[command] as readonly OrderStatus[]).includes(status);

/** Where a step page sends an order its command would refuse, or undefined
 *  when the step may run. record_pick and ship_order also refuse while staged
 *  beer waits, so those go to Put back; any other refusal goes to the order. */
export function stepRedirect(command: OrderMove, order: { id: string; status: OrderStatus; needs_restock?: boolean }): string | undefined {
  if (!orderAllows(command, order.status)) return `/orders/${order.id}`;
  if (order.needs_restock && (command === "record_pick" || command === "ship_order")) return `/orders/${order.id}/restock`;
  return undefined;
}

/** The verb a staff list offers on this order, and the page that does it
 * (#1503). Only a role the next step's command allows gets the verb; anyone
 * else gets Open. A picked taproom transfer completes rather than ships.
 * Staged beer offers Put back in any status: adjusting down, shipping short
 * and cancelling a picked order all leave beer to put back. */
export function nextAction(status: OrderStatus, needsRestock: boolean, id: string, heldRoles: readonly string[], transfer = false): { verb: string; tone: ActionTone; href: string } {
  const roles = !needsRestock && (status === "draft" || status === "submitted") ? salesRoles : warehouseRoles;
  if (!hasAnyRole(heldRoles, roles)) return { verb: "Open", tone: "primary", href: `/orders/${id}` };
  if (needsRestock) return { verb: "Put back", tone: "attention", href: `/orders/${id}/restock` };
  if (status === "picked" && transfer) return { verb: "Complete transfer", tone: "info", href: `/orders/${id}/complete` };
  const [verb, tone, path] = ACTION[status];
  return { verb, tone, href: `/orders/${id}${path}` };
}

const NEXT_STATE: Record<OrderStatus, string> = {
  draft: "submit", submitted: "confirm", confirmed: "pick", picked: "ship", shipped: "delivered or returned", cancelled: "none",
};

/** What the next lifecycle step is called, for the order page's state row. */
export const nextState = (status: OrderStatus, needsRestock: boolean) =>
  (needsRestock ? "put back" : NEXT_STATE[status]);

/** What a delivery stop recorded; deliveries.outcome. */
export type DeliveryOutcome = "delivered" | "partial" | "refused";
const OUTCOME: Record<DeliveryOutcome, string> = { delivered: "Delivered", partial: "Partly delivered", refused: "Refused" };

/** A closed stop's outcome in words, for the order, the route and the delivery
 *  page alike. A stop closed before outcomes were recorded reads Delivered. */
export const deliveryOutcomeLabel = (outcome?: DeliveryOutcome | null) => OUTCOME[outcome ?? "delivered"];

/** The state and next step staff read (#1483). orders.status stops at shipped,
 *  so a closed delivery stop names what happened there. A closed stop or a
 *  shipped pickup (which never gets a stop) has no next step, unless beer it
 *  left behind still waits for Put back. */
export function shownState(status: OrderStatus, needsRestock: boolean, outcome: DeliveryOutcome | null, pickup: boolean): { label: string; next: string } {
  const closed = status === "shipped" && (outcome !== null || pickup);
  return {
    label: status === "shipped" && outcome ? OUTCOME[outcome] : sentenceCase(status),
    next: closed && !needsRestock ? "none" : nextState(status, needsRestock),
  };
}

/** Buyer wording: the portal never prints a staff lifecycle word. */
const BUYER: Record<OrderStatus, string> = {
  draft: "Draft", submitted: "Placed", confirmed: "Confirmed", picked: "Being picked", shipped: "Shipped", cancelled: "Cancelled",
};

/** "Placed · ships Sep 10, 2026" — the one line both portal order surfaces
 *  print. requested_ship_date is a date column, so it needs no time zone. */
export const buyerStatus = (status: string, requestedShipDate?: string | null) =>
  `${BUYER[status as OrderStatus] ?? status}${requestedShipDate ? ` · ships ${formatDate(requestedShipDate)}` : ""}`;
