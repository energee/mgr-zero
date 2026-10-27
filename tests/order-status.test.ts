// tests/order-status.test.ts — the verb a staff list offers on an order follows
// the roles of the command that verb runs, so the list never offers a step the
// command would refuse, and never hides one it would allow.
import { describe, expect, it } from "vitest";
import { getCommandDefinition, STAFF_ROLES } from "@/lib/commands/registry";
import "@/lib/commands/orders";
import { nextAction, parseOrderStatus, salesRoles, shownState, warehouseRoles, type OrderStatus } from "@/lib/mgr/order-status";

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
    expect(nextAction("confirmed", false, "o", ["sales", "warehouse"])).toMatchObject({ verb: "Pick", href: "/orders/o" });
    expect(nextAction("confirmed", true, "o", ["brewer", "warehouse"])).toMatchObject({ verb: "Put back", href: "/orders/o/restock" });
    expect(nextAction("submitted", false, "o", ["brewer", "warehouse"]).verb).toBe("Open");
    expect(nextAction("submitted", false, "o", []).verb).toBe("Open");
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
  it("accepts Delivered as a list filter beside the lifecycle states", () => {
    expect(parseOrderStatus("delivered")).toBe("delivered");
    expect(parseOrderStatus("shipped")).toBe("shipped");
    expect(parseOrderStatus("returned")).toBeUndefined();
  });
});
