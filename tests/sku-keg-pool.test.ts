// SKU commands configure returnable keg deposits without direct SKU writes.
import { beforeAll, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCustomer, seedLocation, seedPriceGroup, priceSku, sql } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let owner: typeof ctx;
let brandId: string;
let formatId: string;
let poolId: string;
beforeAll(async () => {
  const brewery = await makeBrewery();
  ctx = await makeStaffCtx(brewery.id, "sales");
  owner = await makeStaffCtx(brewery.id);
  brandId = (await runCommand("upsert_brand", { name: "Returnable" }, ctx) as { id: string }).id;
  formatId = (await runCommand("upsert_format", { name: "Half keg", basis: "packaged", packageType: "keg", kegSize: "half_bbl", bblPerUnit: 0.5 }, ctx) as { id: string }).id;
  poolId = (await runCommand("create_keg_pool", { name: "House fleet", kind: "owned", depositCents: 3000 }, owner) as { id: string }).id;
});

it("sets, preserves and clears a pool through Sales SKU commands with replay protection", async () => {
  const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
  const input = { brandId, formatId, kegPoolId: poolId };
  const sku = await runCommand("create_sku", input, ctx, execution) as { id: string };
  expect(sku).toMatchObject({ keg_pool_id: poolId, container_source: "owned_fleet" });
  expect(await runCommand("create_sku", input, ctx, execution)).toEqual(sku);
  await expect(runCommand("create_sku", { ...input, kegPoolId: null }, ctx, execution)).rejects.toThrow(/different payload/);
  expect(await runCommand("list_keg_pools", {}, ctx)).toMatchObject([{ id: poolId }]);
  expect(await runCommand("update_sku", { skuId: sku.id, active: false }, ctx)).toMatchObject({ keg_pool_id: poolId });
  await runCommand("update_keg_pool", { poolId, active: false }, owner);
  expect(await runCommand("update_sku", { skuId: sku.id, active: true, kegPoolId: poolId }, ctx)).toMatchObject({ keg_pool_id: poolId });
  expect(await runCommand("update_sku", { skuId: sku.id, active: true, kegPoolId: null }, ctx)).toMatchObject({ keg_pool_id: null, container_source: null });
  await expect(runCommand("update_sku", { skuId: sku.id, active: true, kegPoolId: poolId }, ctx)).rejects.toThrow(/out of service/);
  await runCommand("update_keg_pool", { poolId, active: true }, owner);
});

it("refuses non-keg and foreign pool links", async () => {
  const can = await runCommand("upsert_format", { name: "Can", basis: "packaged", packageType: "can", bblPerUnit: 0.004 }, ctx) as { id: string };
  await expect(runCommand("create_sku", { brandId, formatId: can.id, kegPoolId: poolId }, ctx)).rejects.toThrow(/keg/);
  const foreign = await makeStaffCtx((await makeBrewery()).id);
  const pool = await runCommand("create_keg_pool", { name: "Foreign", kind: "owned" }, foreign) as { id: string };
  const brand = await runCommand("upsert_brand", { name: "Other returnable" }, ctx) as { id: string };
  await expect(runCommand("create_sku", { brandId: brand.id, formatId, kegPoolId: pool.id }, ctx)).rejects.toThrow(/pool not found/);
  expect((await admin.from("skus").select("id").eq("brand_id", brand.id)).data).toEqual([]);
});

it("offers pool identity only on keg formats and warns when a keg has no pool", async () => {
  const { toSkuViewProps, skuCreateCommand } = await import("../lib/mgr/sku-view");
  const { toSkuListViewProps } = await import("../lib/mgr/sku-list-view");
  const formats = [{ id: formatId, name: "Half keg", package_type: "keg" }];
  const pools = [{ id: poolId, name: "House fleet", active: true }];
  expect(toSkuViewProps({ formats, pools })).toMatchObject({ showKegPool: true, kegPool: "", kegPoolOptions: [{ value: "", label: "None" }, { value: poolId, label: "House fleet", disabled: false }] });
  expect(skuCreateCommand({ brandId, formatId, name: "", upc: "", kegPoolId: poolId }).input).toMatchObject({ kegPoolId: poolId });
  expect(toSkuListViewProps({ brand: { id: brandId, name: "Returnable" }, skus: [{ id: "sku", name: "Half keg", active: true, format_id: formatId, keg_pool_id: null, formats: { name: "Half keg", bbl_per_unit: 0.5, package_type: "keg" } }] }).rows[0]?.detail).toContain("No keg pool");
});

it("charges the selected pool through an ordinary submitted staff order and invoice", async () => {
  const priceGroupId = await seedPriceGroup(ctx.breweryId);
  const brand = await runCommand("upsert_brand", { name: "Deposit by command", priceGroupId }, ctx) as { id: string };
  const sku = await runCommand("create_sku", { brandId: brand.id, formatId, kegPoolId: poolId }, ctx) as { id: string };
  const customer = await seedCustomer(ctx.breweryId);
  const location = await seedLocation(ctx.breweryId);
  await priceSku(ctx.breweryId, { saleChannelId: customer.saleChannelId, brandId: brand.id, formatId, cents: 12000 });
  await runCommand("record_movement", { skuId: sku.id, locationId: location.id, binId: location.binId, type: "opening_balance", qty: 10 }, owner);
  const order = await runCommand("create_order", { kind: "wholesale", customerId: customer.customerId, shipToId: customer.shipToId, fromLocationId: location.id, lines: [{ skuId: sku.id, qty: 2 }] }, ctx) as { order_id: string };
  await runCommand("submit_order", { orderId: order.order_id }, ctx);
  const deposits = await admin.from("order_deposit_lines").select("keg_pool_id, unit_price_cents").eq("order_id", order.order_id);
  expect(deposits.error).toBeNull();
  expect(deposits.data).toEqual([{ keg_pool_id: poolId, unit_price_cents: 3000 }]);
  await runCommand("confirm_order", { orderId: order.order_id }, ctx);
  const lines = (await admin.from("order_lines").select("id").eq("order_id", order.order_id)).data!;
  await runCommand("record_pick", { orderId: order.order_id, picks: lines.map(l => ({ lineId: l.id, qty: 2 })) }, owner);
  const shipped = await runCommand("ship_order", { orderId: order.order_id, invoiceTiming: "now", ship: lines.map(l => ({ lineId: l.id, qty: 2 })) }, owner) as { invoice_id: string };
  const invoice = await admin.from("invoice_lines").select("kind, keg_pool_id, unit_price_cents").eq("invoice_id", shipped.invoice_id).eq("kind", "keg_deposit");
  expect(invoice.error).toBeNull();
  expect(invoice.data).toMatchObject([{ keg_pool_id: poolId, unit_price_cents: 3000 }]);
});

it("replays successful pre-upgrade SKU requests when no pool change was requested", async () => {
  const requestId = crypto.randomUUID();
  sql(`insert into private.command_requests(actor_id,brewery_id,request_id,command_name,payload_hash,result)
    values('${ctx.userId}','${ctx.breweryId}','${requestId}','create_sku',
    extensions.digest(jsonb_build_object('brewery','${ctx.breweryId}'::uuid,'brand','${brandId}'::uuid,'format','${formatId}'::uuid,'name',null,'upc',null)::text,'sha256'),'{}')`);
  expect(await runCommand("create_sku", { brandId, formatId }, ctx, { requestId, correlationId: requestId })).toEqual({});
  const updateId = crypto.randomUUID();
  const skuId = crypto.randomUUID();
  sql(`insert into private.command_requests(actor_id,brewery_id,request_id,command_name,payload_hash,result)
    values('${ctx.userId}','${ctx.breweryId}','${updateId}','update_sku',
    extensions.digest(jsonb_build_object('brewery','${ctx.breweryId}'::uuid,'id','${skuId}'::uuid,'active',true,'upc',null)::text,'sha256'),'{}')`);
  expect(await runCommand("update_sku", { skuId, active: true }, ctx, { requestId: updateId, correlationId: updateId })).toEqual({});
});

it("derives per-fill rental source and refuses keg formats without a fleet size", async () => {
  const vendor = await runCommand("upsert_vendor", { name: "Rental vendor" }, owner) as { id: string };
  const pool = await runCommand("create_keg_pool", { name: "Rental pool", kind: "pay_per_fill", vendorId: vendor.id, perFillCents: 200, depositCents: 2500 }, owner) as { id: string };
  const brand = await runCommand("upsert_brand", { name: "Rental beer" }, ctx) as { id: string };
  expect(await runCommand("create_sku", { brandId: brand.id, formatId, kegPoolId: pool.id }, ctx)).toMatchObject({ keg_pool_id: pool.id, container_source: "per_fill_rental" });
  const format = await runCommand("upsert_format", { name: "Unclassified keg", basis: "packaged", packageType: "keg", bblPerUnit: 0.5 }, ctx) as { id: string };
  await expect(runCommand("create_sku", { brandId: brand.id, formatId: format.id, kegPoolId: pool.id }, ctx)).rejects.toThrow(/keg size/);
});
