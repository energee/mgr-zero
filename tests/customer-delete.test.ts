// Customer deletion: atomic cleanup, durable replay, tenant/role checks and history protection.
import { expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCustomer, makeCustomerUser, seedCatalog, seedLocation, priceSku } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

it("deletes an unused customer and its addresses, and safely replays", async () => {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id);
  const customer = await seedCustomer(brewery.id);
  const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
  const input = { customerId: customer.customerId };
  const result = await runCommand("delete_customer", input, ctx, execution);
  expect(await runCommand("delete_customer", input, ctx, execution)).toEqual(result);
  expect((await admin.from("customers").select("id").eq("id", customer.customerId)).data).toEqual([]);
  expect((await admin.from("ship_tos").select("id").eq("customer_id", customer.customerId)).data).toEqual([]);
});

it("protects portal customers and rolls back address cleanup", async () => {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id);
  const customer = await seedCustomer(brewery.id);
  await makeCustomerUser(customer.customerId);
  await expect(runCommand("delete_customer", { customerId: customer.customerId }, ctx)).rejects.toThrow(/in use/);
  expect((await admin.from("customers").select("id").eq("id", customer.customerId)).data).toHaveLength(1);
  expect((await admin.from("ship_tos").select("id").eq("customer_id", customer.customerId)).data).toHaveLength(1);
});

it("rejects non-admin and cross-tenant deletion at the RPC boundary", async () => {
  const brewery = await makeBrewery();
  const customer = await seedCustomer(brewery.id);
  const sales = await makeStaffCtx(brewery.id, "sales");
  const other = await makeStaffCtx((await makeBrewery()).id);
  for (const ctx of [sales, other]) {
    const result = await ctx.db.rpc("delete_customer", { p_brewery: brewery.id, p_id: customer.customerId, p_request_id: crypto.randomUUID() });
    expect(result.error?.code).toBe("42501");
  }
  await expect(runCommand("delete_customer", { customerId: customer.customerId }, other)).rejects.toThrow(/not found/);
  expect((await admin.from("customers").select("id").eq("id", customer.customerId)).data).toHaveLength(1);
});

it("preserves orders, lines and addresses when deleting a customer with history", async () => {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id);
  const customer = await seedCustomer(brewery.id);
  const catalog = await seedCatalog(brewery.id);
  const location = await seedLocation(brewery.id);
  await priceSku(brewery.id, { saleChannelId: customer.saleChannelId, brandId: catalog.brandId, formatId: catalog.formatId, cents: 4000 });
  const order = await runCommand("create_order", {
    kind: "wholesale", customerId: customer.customerId, shipToId: customer.shipToId,
    fromLocationId: location.id, lines: [{ skuId: catalog.skuId, qty: 1 }],
  }, ctx) as { order_id: string };
  await expect(runCommand("delete_customer", { customerId: customer.customerId }, ctx)).rejects.toThrow(/in use/);
  expect((await admin.from("orders").select("id").eq("id", order.order_id)).data).toHaveLength(1);
  expect((await admin.from("order_lines").select("id").eq("order_id", order.order_id)).data).toHaveLength(1);
  expect((await admin.from("ship_tos").select("id").eq("id", customer.shipToId)).data).toHaveLength(1);
});
