// tests/integration-command-roles.test.ts — registry coverage for the QuickBooks
// and Square integration commands. The database-backed boundary suite never
// invokes these (connecting an external provider is not something a live RLS
// test can do), so their registration was unproven: a command could have shipped
// with `roles: "any"`, or with no schema at all, and nothing would have failed.
//
// This is pure: it reads registration metadata through the same accessors
// runCommand uses (getCommandDefinition for the schema, canRun for the role
// check) and never touches Postgres or an external API.
import { describe, expect, it } from "vitest";
import { STAFF_ROLES, canRun, getCommandDefinition, type OperationCtx, type StaffRole } from "../lib/commands/registry";
import "../lib/commands/all";

/** The integration commands and the roles each one is registered to allow. */
const integrationCommands: Record<string, StaffRole[]> = {
  connect_qbo: ["admin"],
  disconnect_qbo: ["admin"],
  get_qbo_connection: ["admin", "sales"],
  push_invoice_to_qbo: ["admin", "sales"],
  sync_qbo_payments: ["admin", "sales"],
  connect_square: ["admin"],
  disconnect_square: ["admin"],
  sync_square_catalog: ["admin"],
  sync_square_sales: ["admin"],
};

const ctxFor = (role: StaffRole) => ({ breweryId: "11111111-1111-4111-8111-111111111111", role, userId: "22222222-2222-4222-8222-222222222222" } as unknown as OperationCtx);

describe("integration command registration", () => {
  it.each(Object.keys(integrationCommands))("%s is registered with a schema", (name) => {
    const def = getCommandDefinition(name);
    expect(def, `${name} is not registered — lib/commands/all must import its module`).toBeDefined();
    expect(def!.input).toBeDefined();
  });

  it.each(Object.entries(integrationCommands))("%s is scoped to exactly its allowed roles", (name, allowed) => {
    const def = getCommandDefinition(name)!;
    // Never "any" and never "customer": an external-provider command is staff-only.
    expect(Array.isArray(def.roles), `${name} must enumerate staff roles, not "${String(def.roles)}"`).toBe(true);
    expect([...(def.roles as StaffRole[])].sort()).toEqual([...allowed].sort());
  });

  it.each(Object.entries(integrationCommands))("%s rejects every role outside its list", (name, allowed) => {
    const denied = STAFF_ROLES.filter((role) => !allowed.includes(role));
    expect(denied.length, `${name} would allow all of staff`).toBeGreaterThan(0);
    for (const role of denied) expect(canRun(ctxFor(role), name), `${name} must deny ${role}`).toBe(false);
    for (const role of allowed) expect(canRun(ctxFor(role), name), `${name} must allow ${role}`).toBe(true);
  });

  it.each(Object.keys(integrationCommands))("%s rejects garbage input", (name) => {
    const schema = getCommandDefinition(name)!.input;
    // A string, a number, and null are never a valid command payload: every
    // registered input is an object schema, so parsing must fail before any
    // handler (and any outbound provider call) runs.
    for (const garbage of ["", "nope", 7, null, []]) expect(schema.safeParse(garbage).success, `${name} accepted ${JSON.stringify(garbage)}`).toBe(false);
  });

  it.each(["disconnect_qbo", "disconnect_square"])("%s requires a connectionId", (name) => {
    const schema = getCommandDefinition(name)!.input;
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ connectionId: "not-a-uuid" }).success).toBe(false);
    expect(schema.safeParse({ connectionId: "33333333-3333-4333-8333-333333333333" }).success).toBe(true);
  });
});
