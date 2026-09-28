// tests/order-status.test.ts — the verb a staff list offers on an order follows
// the roles of the command that verb runs, so the list never offers a step the
// command would refuse, and never hides one it would allow.
import { describe, expect, it } from "vitest";
import { getCommandDefinition, STAFF_ROLES } from "@/lib/commands/registry";
import "@/lib/commands/orders";
import { nextAction, salesRoles, warehouseRoles, type OrderStatus } from "@/lib/mgr/order-status";

/** The command each list verb finishes. */
const COMMAND: [OrderStatus, boolean, string][] = [
  ["draft", false, "submit_order"],
  ["submitted", false, "confirm_order"],
  ["confirmed", false, "record_pick"],
  ["picked", false, "ship_order"],
  ["picked", true, "confirm_restock"],
];

describe("nextAction", () => {
  it("offers the verb exactly to the roles its command allows", () => {
    for (const [status, restock, command] of COMMAND) {
      const roles = getCommandDefinition(command)!.roles as readonly string[];
      for (const role of STAFF_ROLES) {
        expect(nextAction(status, restock, "o", role).verb !== "Open", `${command} as ${role}`).toBe(roles.includes(role));
      }
    }
  });

  it("shares its role lists with the order commands", () => {
    expect(getCommandDefinition("submit_order")!.roles).toEqual([...salesRoles]);
    expect(getCommandDefinition("ship_order")!.roles).toEqual([...warehouseRoles]);
  });
});
