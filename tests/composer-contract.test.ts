import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { operationsFor } from "@/lib/agent/operations";
import {
  _clearRegistry,
  defineCommand,
  defineQuery,
  type Ctx,
} from "@/lib/commands/registry";

const db = null as unknown as Ctx["db"];
const admin = { db, userId: "a", breweryId: "b", roles: ["admin" as const] };
const warehouse = { ...admin, roles: ["warehouse" as const] };
const customer = { ...admin, roles: ["customer" as const], customerId: "c" };

describe("composer registry contract", () => {
  beforeEach(() => _clearRegistry());

  it("fails closed for invalid AI and offline metadata", () => {
    expect(() => defineCommand({
      name: "unconfirmed", input: z.object({}), roles: ["admin"],
      preview: async () => ({ effects: [], warnings: [], version: {} }),
      handler: async () => null,
    })).toThrow(/confirmation/i);

    expect(() => defineCommand({
      name: "unsafe_offline", input: z.object({}), roles: ["admin"],
      idempotency: "online_only", offlineReplay: true,
      handler: async () => null,
    })).toThrow(/offline replay/i);
  });

  it("offers a model only what the person's role allows, and a customer only portal reads", () => {
    defineQuery({ name: "staff_read", input: z.object({}), roles: ["admin"], handler: async () => null });
    defineQuery({ name: "warehouse_read", input: z.object({}), roles: ["warehouse"], handler: async () => null });
    defineQuery({ name: "secret_read", input: z.object({}), roles: ["admin"], agentHidden: true, handler: async () => null });
    defineQuery({ name: "portal_catalog", input: z.object({}), roles: "customer", handler: async () => null });
    defineQuery({ name: "unsafe_customer_read", input: z.object({}), roles: "customer", handler: async () => null });

    expect(operationsFor(admin).map((tool) => tool.name)).toEqual(["staff_read"]);
    expect(operationsFor(warehouse).map((tool) => tool.name)).toEqual(["warehouse_read"]);
    expect(operationsFor(customer).map((tool) => tool.name)).toEqual(["portal_catalog"]);
  });
});
