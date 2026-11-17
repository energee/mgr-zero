// tests/order-status.test.ts — the verb a staff list offers on an order follows
// the roles of the command that verb runs, so the list never offers a step the
// command would refuse, and never hides one it would allow.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getCommandDefinition, STAFF_ROLES } from "@/lib/commands/registry";
import "@/lib/commands/orders";
import { pickDoneHref, type PickSnapshot } from "@/lib/mgr/pick-view";
import { deliveryOutcomeLabel, nextAction, ORDER_MOVES, ORDER_STATUSES, orderAllows, parseOrderStatus, salesRoles, shownState, stepRedirect, warehouseRoles, type OrderStatus } from "@/lib/mgr/order-status";
import { Constants } from "@/lib/supabase/database.generated";

/** The command each list verb finishes. */
const COMMAND: [OrderStatus, boolean, string][] = [
  ["draft", false, "submit_order"],
  ["submitted", false, "confirm_order"],
  ["confirmed", false, "record_pick"],
  ["picked", false, "ship_order"],
  ["picked", true, "confirm_restock"],
  // #811: a mixed adjust leaves staged beer on a confirmed order; Put back still comes first
  ["confirmed", true, "confirm_restock"],
];

describe("nextAction", () => {
  it("offers the verb exactly to the roles its command allows", () => {
    for (const [status, restock, command] of COMMAND) {
      const roles = getCommandDefinition(command)!.roles as readonly string[];
      for (const role of STAFF_ROLES) {
        expect(nextAction(status, restock, "o", [role]).verb !== "Open", `${command} as ${role}`).toBe(roles.includes(role));
      }
    }
  });

  it("offers each lifecycle step to a member holding both sales and warehouse", () => {
    expect(nextAction("submitted", false, "o", ["sales", "warehouse"])).toMatchObject({ verb: "Confirm", href: "/orders/o/confirm" });
    expect(nextAction("confirmed", false, "o", ["sales", "warehouse"])).toMatchObject({ verb: "Pick", href: "/orders/o/pick" });
    expect(nextAction("confirmed", true, "o", ["brewer", "warehouse"])).toMatchObject({ verb: "Put back", href: "/orders/o/restock" });
    expect(nextAction("submitted", false, "o", ["brewer", "warehouse"]).verb).toBe("Open");
    expect(nextAction("submitted", false, "o", []).verb).toBe("Open");
  });

  it("links each verb to the page that does the work, not the order page (#1503)", () => {
    expect(nextAction("picked", false, "o", ["warehouse"])).toMatchObject({ verb: "Ship", href: "/orders/o/ship" });
    expect(nextAction("picked", false, "o", ["warehouse"], true)).toMatchObject({ verb: "Complete transfer", href: "/orders/o/complete" });
    expect(nextAction("picked", true, "o", ["warehouse"], true)).toMatchObject({ verb: "Put back", href: "/orders/o/restock" });
  });

  it("shares its role lists with the order commands", () => {
    expect(getCommandDefinition("submit_order")!.roles).toEqual([...salesRoles]);
    expect(getCommandDefinition("ship_order")!.roles).toEqual([...warehouseRoles]);
  });
});

describe("shownState (#1483)", () => {
  it("names a shipped order by its closed delivery stop, with no next step", () => {
    expect(shownState("shipped", false, "delivered", false)).toEqual({ label: "Delivered", next: "none" });
    expect(shownState("shipped", false, "partial", false)).toEqual({ label: "Partly delivered", next: "none" });
    expect(shownState("shipped", false, "refused", false)).toEqual({ label: "Refused", next: "none" });
  });
  it("keeps an open stop on Shipped, and a shipped pickup has no next step", () => {
    expect(shownState("shipped", false, null, false)).toEqual({ label: "Shipped", next: "delivered or returned" });
    expect(shownState("shipped", false, null, true)).toEqual({ label: "Shipped", next: "none" });
  });
  it("leaves every earlier state and the staged-beer override as they were", () => {
    expect(shownState("confirmed", false, null, false)).toEqual({ label: "Confirmed", next: "pick" });
    expect(shownState("picked", true, null, false)).toEqual({ label: "Picked", next: "put back" });
  });
  it("words a stop's outcome the same on the order, the route and the delivery page", () => {
    expect(deliveryOutcomeLabel("partial")).toBe("Partly delivered");
    expect(deliveryOutcomeLabel("refused")).toBe("Refused");
    // A stop closed before outcomes were recorded reads Delivered.
    expect(deliveryOutcomeLabel(null)).toBe("Delivered");
    for (const page of ["app/(app)/routes/[id]/page.tsx", "app/(app)/work/deliveries/[id]/page.tsx"]) {
      expect(readFileSync(page, "utf8"), page).not.toMatch(/sentenceCase\([^)]*outcome/);
    }
  });
  it("accepts Delivered as a list filter beside the lifecycle states", () => {
    expect(parseOrderStatus("delivered")).toBe("delivered");
    expect(parseOrderStatus("shipped")).toBe("shipped");
    expect(parseOrderStatus("returned")).toBeUndefined();
  });
});

describe("pickDoneHref (#1503)", () => {
  const order = (over: Partial<PickSnapshot["order"]> = {}) => ({ id: "o", order_no: 1, from_location_id: "wh", ...over });
  const lines = [{ id: "a", sku_id: "s", qty_ordered: 3, qty_picked: null, skus: null as never }];
  it("goes on to Ship once every line is counted in full and nothing waits to be put back", () => {
    expect(pickDoneHref(order(), lines, { a: "3" })).toBe("/orders/o/ship");
    expect(pickDoneHref(order({ kind: "taproom_transfer" }), lines, { a: "3" })).toBe("/orders/o/complete");
  });
  it("returns to the order while a line is short or staged beer waits", () => {
    expect(pickDoneHref(order(), lines, { a: "2" })).toBe("/orders/o");
    expect(pickDoneHref(order({ needs_restock: true }), lines, { a: "3" })).toBe("/orders/o");
  });
});

describe("the order lifecycle has one owner", () => {
  it("lists exactly the database's order statuses, in order", () => {
    expect([...ORDER_STATUSES]).toEqual([...Constants.public.Enums.order_status]);
  });

  it("keys its legal moves by registered order commands", () => {
    for (const command of Object.keys(ORDER_MOVES)) expect(getCommandDefinition(command), command).toBeDefined();
  });

  it("answers which statuses a command accepts", () => {
    expect(ORDER_STATUSES.filter((s) => orderAllows("ship_order", s))).toEqual(["picked"]);
    expect(ORDER_STATUSES.filter((s) => orderAllows("record_pick", s))).toEqual(["confirmed", "picked"]);
    expect(ORDER_STATUSES.filter((s) => orderAllows("cancel_order", s))).toEqual(["draft", "submitted", "confirmed", "picked"]);
    expect(ORDER_STATUSES.filter((s) => orderAllows("set_order_pickup", s))).toEqual(["draft", "submitted", "confirmed", "picked"]);
  });

  it("offers Put back wherever beer is staged, cancelled and shipped orders included", () => {
    for (const status of ["confirmed", "picked", "shipped", "cancelled"] as const) {
      expect(nextAction(status, true, "o", ["warehouse"]), status).toMatchObject({ verb: "Put back", href: "/orders/o/restock" });
      expect(nextAction(status, true, "o", ["sales"]).verb, status).toBe("Open");
    }
    expect(shownState("cancelled", true, null, false)).toEqual({ label: "Cancelled", next: "put back" });
    expect(shownState("shipped", true, "delivered", false)).toEqual({ label: "Delivered", next: "put back" });
    expect(shownState("cancelled", false, null, false)).toEqual({ label: "Cancelled", next: "none" });
  });

  it("sends a step page's visitor to Put back or the order when the command would refuse", () => {
    const order = (status: OrderStatus, needs_restock = false) => ({ id: "o", status, needs_restock });
    expect(stepRedirect("ship_order", order("picked"))).toBeUndefined();
    expect(stepRedirect("ship_order", order("confirmed"))).toBe("/orders/o");
    // ship_order and record_pick both refuse while staged beer waits
    expect(stepRedirect("ship_order", order("picked", true))).toBe("/orders/o/restock");
    expect(stepRedirect("record_pick", order("confirmed", true))).toBe("/orders/o/restock");
    expect(stepRedirect("confirm_order", order("submitted"))).toBeUndefined();
    expect(stepRedirect("update_draft_order", order("submitted"))).toBe("/orders/o");
  });
});
