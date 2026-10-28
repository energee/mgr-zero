// Ship-to deletion (#1487): an unused, non-default ship-to goes; a default one
// or one an order names stays, and the request replays.
import { expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

const remaining = async (id: string) => (await admin.from("ship_tos").select("id").eq("id", id)).data;

it("deletes an unused ship-to for Sales, and safely replays", async () => {
  const brewery = await makeBrewery();
  const sales = await makeStaffCtx(brewery.id, "sales");
  const { shipToId } = await seedCustomer(brewery.id);
  const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
  const result = await runCommand("delete_ship_to", { shipToId }, sales, execution);
  expect(await runCommand("delete_ship_to", { shipToId }, sales, execution)).toEqual(result);
  expect(await remaining(shipToId)).toEqual([]);
});

it("refuses the default ship-to: another becomes the default first", async () => {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id);
  const { shipToId } = await seedCustomer(brewery.id);
  await admin.from("ship_tos").update({ is_default: true }).eq("id", shipToId);
  await expect(runCommand("delete_ship_to", { shipToId }, ctx)).rejects.toThrow(/default ship-to cannot be deleted/);
  expect(await remaining(shipToId)).toHaveLength(1);
});

it("refuses a ship-to an order names, so the order keeps its destination", async () => {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id);
  const customer = await seedCustomer(brewery.id);
  const catalog = await seedCatalog(brewery.id);
  const location = await seedLocation(brewery.id);
  await priceSku(brewery.id, { saleChannelId: customer.saleChannelId, brandId: catalog.brandId, formatId: catalog.formatId, cents: 4000 });
  await runCommand("create_order", {
    kind: "wholesale", customerId: customer.customerId, shipToId: customer.shipToId,
    fromLocationId: location.id, lines: [{ skuId: catalog.skuId, qty: 1 }],
  }, ctx);
  await expect(runCommand("delete_ship_to", { shipToId: customer.shipToId }, ctx)).rejects.toThrow(/on an order/);
  expect(await remaining(customer.shipToId)).toHaveLength(1);
});

it("rejects Warehouse and another brewery at the RPC boundary", async () => {
  const brewery = await makeBrewery();
  const { shipToId } = await seedCustomer(brewery.id);
  const warehouse = await makeStaffCtx(brewery.id, "warehouse");
  const other = await makeStaffCtx((await makeBrewery()).id);
  for (const ctx of [warehouse, other]) {
    const result = await ctx.db.rpc("delete_ship_to", { p_brewery: brewery.id, p_id: shipToId, p_request_id: crypto.randomUUID() });
    expect(result.error?.code).toBe("42501");
  }
  await expect(runCommand("delete_ship_to", { shipToId }, other)).rejects.toThrow(/not found/);
  expect(await remaining(shipToId)).toHaveLength(1);
});
