import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  _clearRegistry,
  defineCommand,
  defineQuery,
  listTools,
  type Ctx,
} from "@/lib/commands/registry";

const db = null as unknown as Ctx["db"];
const admin = { db, userId: "a", breweryId: "b", role: "admin" as const };
const warehouse = { ...admin, role: "warehouse" as const };
const customer = { ...admin, role: "customer" as const, customerId: "c" };

describe("composer registry contract", () => {
  beforeEach(() => _clearRegistry());

  it("fails closed for invalid AI and offline metadata", () => {
    expect(() => defineCommand({
      name: "unsafe", input: z.object({}), roles: ["admin"], aiExposed: true,
      handler: async () => null,
    })).toThrow(/preview/i);

    expect(() => defineCommand({
      name: "unconfirmed", input: z.object({}), roles: ["admin"], aiExposed: true,
      preview: async () => ({ effects: [], warnings: [], version: {} }),
      handler: async () => null,
    })).toThrow(/confirmation/i);

    expect(() => defineCommand({
      name: "unsafe_offline", input: z.object({}), roles: ["admin"],
      idempotency: "online_only", offlineReplay: true,
      handler: async () => null,
    })).toThrow(/offline replay/i);
  });

  it("defaults to unexposed and lists only role-allowed AI tools", () => {
    defineQuery({ name: "ordinary", input: z.object({}), roles: ["admin"], handler: async () => null });
    defineQuery({ name: "staff_read", input: z.object({}), roles: ["admin"], aiExposed: true, handler: async () => null });
    defineQuery({ name: "warehouse_read", input: z.object({}), roles: ["warehouse"], aiExposed: true, handler: async () => null });
    defineQuery({ name: "portal_catalog", input: z.object({}), roles: "customer", aiExposed: true, handler: async () => null });
    defineQuery({ name: "unsafe_customer_read", input: z.object({}), roles: "customer", aiExposed: true, handler: async () => null });

    expect(listTools().find((tool) => tool.name === "ordinary")).toMatchObject({ aiExposed: false });
    expect(listTools({ aiOnly: true, ctx: admin }).map((tool) => tool.name)).toEqual(["staff_read"]);
    expect(listTools({ aiOnly: true, ctx: warehouse }).map((tool) => tool.name)).toEqual(["warehouse_read"]);
    expect(listTools({ aiOnly: true, ctx: customer }).map((tool) => tool.name)).toEqual(["portal_catalog"]);
  });
});
