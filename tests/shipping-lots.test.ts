import { buildReturnLines } from "@/app/(app)/invoices/[id]/credit-memo-form";
import { beforeAll, expect, it } from "vitest";
import { admin, ins, insertFixture, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, seedCustomer, priceSku, sql, seedMaterial } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let cat: Awaited<ReturnType<typeof seedCatalog>>, loc: Awaited<ReturnType<typeof seedLocation>>, cust: Awaited<ReturnType<typeof seedCustomer>>;
let bin: string;
const lots: string[] = [];
beforeAll(async () => {
  const b = await makeBrewery(); ctx = await makeStaffCtx(b.id);
  cat = await seedCatalog(b.id, { packageType: "keg", bblPerUnit: 0.5 });
  loc = await seedLocation(b.id); cust = await seedCustomer(b.id);
  bin = (await ins("bins", { brewery_id: b.id, location_id: loc.id, name: "Actual packaging bin" })).id;
  await priceSku(b.id, { saleChannelId: cust.saleChannelId, brandId: cat.brandId, formatId: cat.formatId, cents: 12000 });
  const vessel = await runCommand("upsert_vessel", { name: "Trace tank", kind: "fermenter", capacityBbl: 60 }, ctx) as { id: string };
  const batch = await runCommand("schedule_batch", { plannedOn: "2026-09-01", plannedBbl: 30, intendedBrandId: cat.brandId }, ctx) as { id: string };
  const day = await runCommand("record_brew_day", { batchId: batch.id, vesselId: vessel.id, initialBbl: 30, brewedOn: "2026-09-01" }, ctx) as { occupancy: { id: string } };
  for (let n = 0; n < 2; n++) {
    const run = await runCommand("schedule_packaging_run", { brandId: cat.brandId, plannedOn: "2026-09-02", occupancyId: day.occupancy.id, outputs: [{ skuId: cat.skuId, qtyPlanned: 20 }] }, ctx) as { id: string };
    await runCommand("update_packaging_run", { runId: run.id, startedAt: "2026-09-02T14:00:00Z" }, ctx);
    await runCommand("close_packaging_run", { runId: run.id, bblDrawn: 10, outputs: [{ skuId: cat.skuId, qtyActual: 20 }], lotCode: `TRACE-${n}`, packagedOn: "2026-09-02", locationId: loc.id, binId: n ? loc.binId : bin }, ctx);
    lots.push((await admin.from("lots").select("id").eq("packaging_run_id", run.id).single()).data!.id);
  }
});
async function order(qty = 4) {
  const o = await runCommand("create_order", { kind: "wholesale", customerId: cust.customerId, shipToId: cust.shipToId, fromLocationId: loc.id, lines: [{ skuId: cat.skuId, qty }] }, ctx) as { order_id: string };
  await runCommand("submit_order", { orderId: o.order_id }, ctx); await runCommand("confirm_order", { orderId: o.order_id }, ctx);
  const line = (await admin.from("order_lines").select("id").eq("order_id", o.order_id).single()).data!.id;
  await runCommand("record_pick", { orderId: o.order_id, picks: [{ lineId: line, qty }] }, ctx);
  return { id: o.order_id, line };
}
it("rejects UUID spellings that alias the same shipping source", async () => {
  const o = await order();
  const requestId = crypto.randomUUID();
  const result = await ctx.db.rpc("ship_order", { p_order: o.id, p_ship: [{ line_id: o.line, qty_shipped: 4, sources: [{ bin_id: bin, lot_id: lots[0], qty: 2 }, { bin_id: bin.toUpperCase(), lot_id: lots[0].toUpperCase(), qty: 2 }] }], p_carrier: null, p_tracking: null, p_request_id: requestId });
  expect(result.error).not.toBeNull();
  expect((await admin.from("shipments").select("id").eq("order_id", o.id)).data).toEqual([]);
  expect((await admin.from("inventory_movements").select("id").eq("ref", o.id)).data).toEqual([]);
});
it("ships two real packaged lots from their actual bins with one invoice line", async () => {
  const o = await order();
  const result = await runCommand("ship_order", { orderId: o.id, ship: [{ lineId: o.line, qty: 4, sources: [{ binId: bin, lotId: lots[0], qty: 2 }, { binId: loc.binId, lotId: lots[1], qty: 2 }] }] }, ctx) as { invoice_id: string };
  const movements = (await admin.from("inventory_movements").select("lot_id,bin_id,qty,bbl").eq("ref", o.id)).data!;
  expect(movements).toHaveLength(2);
  expect(movements).toEqual(expect.arrayContaining([{ lot_id: lots[0], bin_id: bin, qty: -2, bbl: -1 }, { lot_id: lots[1], bin_id: loc.binId, qty: -2, bbl: -1 }]));
  expect((await admin.from("invoice_lines").select("qty").eq("invoice_id", result.invoice_id)).data).toEqual([{ qty: 4 }]);
  const trace = await runCommand("trace_lot", { lotId: lots[0] }, ctx) as { recipients: { id: string; customers: { id: string }; shipments: { invoices: { id: string }[] }[] }[]; balances: { bin_id: string; qty: number }[] };
  expect(trace.recipients).toEqual([expect.objectContaining({ id: o.id, customers: expect.objectContaining({ id: cust.customerId }), shipments: [expect.objectContaining({ invoices: [expect.objectContaining({ id: result.invoice_id })] })] })]);
  expect(trace.balances).toContainEqual(expect.objectContaining({ bin_id: bin, qty: 18 }));
});
it("rejects omitted sources when only tracked stock exists", async () => {
  const o = await order();
  await expect(runCommand("ship_order", { orderId: o.id, ship: [{ lineId: o.line, qty: 4 }] }, ctx)).rejects.toThrow();
});
it("rejects duplicate and foreign full-line input and invalid source sums atomically", async () => {
  const o = await order();
  for (const ship of [
    [{ line_id: o.line, qty_shipped: 2 }, { line_id: o.line, qty_shipped: 2 }],
    [{ line_id: o.line, qty_shipped: 4 }, { line_id: crypto.randomUUID(), qty_shipped: 0 }],
    [{ line_id: o.line, qty_shipped: 4, sources: [{ bin_id: bin, lot_id: lots[0], qty: 3 }] }],
  ]) {
    const r = await ctx.db.rpc("ship_order", { p_order: o.id, p_ship: ship, p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() });
    expect(r.error).not.toBeNull();
    expect((await admin.from("shipments").select("id").eq("order_id", o.id)).data).toEqual([]);
  }
});
it("returns actual shipment sources, freezes original volume, and prevents over-return", async () => {
  const o = await order();
  const shipped = await runCommand("ship_order", { orderId: o.id, ship: [{ lineId: o.line, qty: 4, sources: [{ binId: bin, lotId: lots[0], qty: 4 }] }] }, ctx) as { invoice_id: string };
  const movement = (await admin.from("inventory_movements").select("id").eq("ref", o.id).single()).data!.id;
  const line = (await admin.from("invoice_lines").select("id").eq("invoice_id", shipped.invoice_id).single()).data!.id;
  expect((await admin.from("formats").update({ bbl_per_unit: 0.4 }).eq("id", cat.formatId)).error).toBeNull();
  try {
    const credit = await runCommand("return_shipment", { invoiceId: shipped.invoice_id, locationId: loc.id, reason: "damaged", lines: [{ invoiceLineId: line, qty: 1, sources: [{ movementId: movement, binId: bin, qty: 1 }] }] }, ctx) as { credit_memo_id: string };
    const moves = (await admin.from("inventory_movements").select("lot_id,qty,bbl,type,source_movement_id").eq("ref", credit.credit_memo_id)).data!;
    expect(moves).toEqual(expect.arrayContaining([expect.objectContaining({ lot_id: lots[0], qty: 1, bbl: 0.5, type: "return_in", source_movement_id: movement }), expect.objectContaining({ lot_id: lots[0], qty: -1, bbl: -0.5, type: "loss" })]));
    await expect(runCommand("return_shipment", { invoiceId: shipped.invoice_id, locationId: loc.id, reason: "unsold", lines: [{ invoiceLineId: line, qty: 4, sources: [{ movementId: movement, binId: bin, qty: 4 }] }] }, ctx)).rejects.toThrow();
  } finally { await admin.from("formats").update({ bbl_per_unit: 0.5 }).eq("id", cat.formatId); }
});
it("serializes two orders competing for the same last lot units and preserves replay identity", async () => {
  const remaining = (await admin.from("inventory_movements").select("qty").eq("lot_id", lots[1])).data!.reduce((n,m) => n + Number(m.qty),0);
  const a = await order(remaining), b = await order(remaining), requestId = crypto.randomUUID();
  const args = (o: typeof a, id: string) => ({ p_order: o.id, p_ship: [{ line_id: o.line, qty_shipped: remaining, sources: [{ bin_id: loc.binId, lot_id: lots[1], qty: remaining }] }], p_carrier: null, p_tracking: null, p_request_id: id });
  const [one, two] = await Promise.all([ctx.db.rpc("ship_order", args(a,requestId)), ctx.db.rpc("ship_order", args(b,crypto.randomUUID()))]);
  expect([one,two].filter(r => !r.error)).toHaveLength(1);
  const winner = one.error ? b : a;
  if (!one.error) {
    expect((await ctx.db.rpc("ship_order", args(a, requestId))).data).toEqual(one.data);
    const changed = args(a,requestId); changed.p_ship[0].sources[0].lot_id = lots[0];
    expect((await ctx.db.rpc("ship_order", changed)).error).not.toBeNull();
  }
  expect((await admin.from("inventory_movements").select("qty").eq("ref", winner.id)).data).toHaveLength(1);
});
it("rejects malformed scale, identity and source allocation input without side effects", async () => {
  for (const mutate of [
    (l: Record<string, unknown>) => { l.qty_shipped = 0.001; },
    (l: Record<string, unknown>) => { l.qty_shipped = "NaN"; },
    (l: Record<string, unknown>) => { l.sources = [{ bin_id: bin, lot_id: crypto.randomUUID(), qty: 4 }]; },
    (l: Record<string, unknown>) => { l.sources = [{ bin_id: loc.binId, lot_id: lots[0], qty: 4 }]; },
    (l: Record<string, unknown>) => { l.sources = [{ bin_id: bin, lot_id: lots[0], qty: 2 }, { bin_id: bin, lot_id: lots[0], qty: 2 }]; },
  ]) {
    const o = await order(); const line: Record<string,unknown> = { line_id: o.line, qty_shipped: 4, sources: [{ bin_id: bin, lot_id: lots[0], qty: 4 }] }; mutate(line);
    expect((await ctx.db.rpc("ship_order", { p_order: o.id, p_ship: [line], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() })).error).not.toBeNull();
    expect((await admin.from("inventory_movements").select("id").eq("ref", o.id)).data).toEqual([]);
    expect((await admin.from("shipments").select("id").eq("order_id", o.id)).data).toEqual([]);
  }
});
it("keeps the selected FG lot on both cross-location transfer legs and manual samples", async () => {
  const destination = await seedLocation(ctx.breweryId, { name: "Lot destination" });
  const transfer = await runCommand("create_stock_transfer", { fromLocationId: loc.id, toLocationId: destination.id, lines: [{ skuId: cat.skuId, qty: 2, fromBinId: bin, toBinId: destination.binId }] }, ctx) as { transferId: string };
  await runCommand("submit_stock_transfer", transfer, ctx);
  const line = (await admin.from("stock_transfer_lines").select("id").eq("transfer_id", transfer.transferId).single()).data!.id;
  await runCommand("record_stock_transfer_pick", { ...transfer, picks: [{ lineId: line, qty: 2 }] }, ctx);
  await runCommand("receive_stock_transfer", { ...transfer, lines: [{ lineId: line, qty: 2, sources: [{ lotId: lots[0], qty: 2 }] }] }, ctx);
  expect((await admin.from("inventory_movements").select("lot_id,qty").eq("ref", transfer.transferId)).data).toEqual(expect.arrayContaining([{ lot_id: lots[0], qty: -2 }, { lot_id: lots[0], qty: 2 }]));
  const sample = await runCommand("record_movement", { skuId: cat.skuId, locationId: destination.id, binId: destination.binId, lotId: lots[0], qty: -1, type: "sample", destState: "PA" }, ctx) as { lot_id: string };
  expect(sample.lot_id).toBe(lots[0]);
});
it("traces more than 1000 movements without combining incompatible package units", async () => {
  const format = await ins("formats", { brewery_id: ctx.breweryId, name: "Trace bottle", basis: "packaged", package_type: "bottle", bbl_per_unit: 0.01 });
  const sku = await ins("skus", { brewery_id: ctx.breweryId, brand_id: cat.brandId, format_id: format.id, name: "Trace bottle" });
  const rows = Array.from({ length: 1001 }, () => ({ brewery_id: ctx.breweryId, sku_id: sku.id, bin_id: bin, location_id: loc.id, lot_id: lots[0], qty: 1, type: "production_in", created_by: ctx.userId }));
  for (let start = 0; start < rows.length; start += 500) expect(() => insertFixture("inventory_movements", rows.slice(start,start + 500))).not.toThrow();
  const trace = await runCommand("trace_lot", { lotId: lots[0] }, ctx) as { on_hand: number | null; movements: { sku_id: string }[]; balances: { sku_id: string; qty: number; bbl: number }[] };
  expect(trace.movements.filter(m => m.sku_id === sku.id)).toHaveLength(1001);
  expect(trace.on_hand).toBeNull();
  expect(trace.balances).toContainEqual(expect.objectContaining({ sku_id: sku.id, qty: 1001 }));
});
it("rolls back source movements, invoice, allocation and request result on a downstream invoice failure", async () => {
  const o = await order(1); const requestId = crypto.randomUUID();
  sql(`create function private.test_ship_failure() returns trigger language plpgsql set search_path = '' as $$ begin if new.brewery_id = '${ctx.breweryId}' then raise exception 'forced downstream invoice failure'; end if; return new; end $$; create trigger test_ship_failure before insert on public.invoice_lines for each row execute function private.test_ship_failure();`);
  const args = { p_order: o.id, p_ship: [{ line_id: o.line, qty_shipped: 1, sources: [{ bin_id: bin, lot_id: lots[0], qty: 1 }] }], p_carrier: null, p_tracking: null, p_request_id: requestId };
  try {
    expect((await ctx.db.rpc("ship_order", args)).error?.message).toMatch(/forced downstream/);
    expect((await admin.from("shipments").select("id").eq("order_id", o.id)).data).toEqual([]);
    expect((await admin.from("inventory_movements").select("id").eq("ref", o.id)).data).toEqual([]);
    expect((await admin.from("allocations").select("status").eq("ref", o.line)).data).toEqual([{ status: "open" }]);
  } finally { sql("drop trigger test_ship_failure on public.invoice_lines; drop function private.test_ship_failure();"); }
  expect((await ctx.db.rpc("ship_order", args)).error).toBeNull();
});
it("warehouse reads source identities but cannot read recall contact data", async () => {
  const warehouse = await makeStaffCtx(ctx.breweryId, "warehouse"); const o = await order(1);
  const available = await runCommand("get_order_ship_sources", { orderId: o.id }, warehouse) as { stock: { lot_id: string }[] };
  expect(available.stock).toContainEqual(expect.objectContaining({ lot_id: lots[0] }));
  await expect(runCommand("trace_lot", { lotId: lots[0] }, warehouse)).rejects.toMatchObject({ status: 403 });
});
it("on-delivery lot shipping posts once, then both credit entry points retain the original source", async () => {
  const o = await order(2);
  const shipped = await runCommand("ship_order", { orderId: o.id, invoiceTiming: "on_delivery", ship: [{ lineId: o.line, qty: 2, sources: [{ binId: bin, lotId: lots[0], qty: 2 }] }] }, ctx) as { invoice_id: string | null };
  expect(shipped.invoice_id).toBeNull();
  const shipment = (await admin.from("shipments").select("id").eq("order_id", o.id).single()).data!.id;
  const route = await runCommand("save_route", { deliveryDate: "2026-09-10", stops: [{ shipmentId: shipment, stopNo: 1 }] }, ctx) as { routeId: string };
  await runCommand("depart_route", route, ctx);
  const delivery = (await admin.from("deliveries").select("id").eq("route_id", route.routeId).single()).data!.id;
  const result = await runCommand("confirm_delivery", { deliveryId: delivery, signedBy: "Fixture recipient" }, ctx) as { invoice_id: string };
  const movements = (await admin.from("inventory_movements").select("id,lot_id,qty").eq("ref", o.id)).data!;
  expect(movements).toEqual([expect.objectContaining({ lot_id: lots[0], qty: -2 })]);
  const line = (await admin.from("invoice_lines").select("id").eq("invoice_id", result.invoice_id).single()).data!.id;
  const input = { invoiceId: result.invoice_id, locationId: loc.id, reason: "unsold", lines: [{ invoiceLineId: line, qty: 1, sources: [{ movementId: movements[0].id, binId: bin, qty: 1 }] }] };
  await runCommand("create_credit_memo", input, ctx); await runCommand("return_shipment", input, ctx);
  const returns = (await admin.from("inventory_movements").select("qty,bbl,lot_id").eq("source_movement_id", movements[0].id)).data!;
  expect(returns).toHaveLength(2); expect(returns.reduce((n,r) => n + Number(r.bbl),0)).toBe(1);
  expect(returns.every(r => r.lot_id === lots[0])).toBe(true);
  await expect(runCommand("create_credit_memo", input, ctx)).rejects.toThrow();
});
it("complete transfer preserves an explicit lot into its chosen destination bin", async () => {
  const dest = await seedLocation(ctx.breweryId, { name: "Complete lot taproom", kind: "taproom" });
  const o = await runCommand("create_order", { kind: "taproom_transfer", fromLocationId: loc.id, toLocationId: dest.id, lines: [{ skuId: cat.skuId, qty: 1 }] }, ctx) as { order_id: string };
  await runCommand("submit_order", { orderId: o.order_id }, ctx); await runCommand("confirm_order", { orderId: o.order_id }, ctx);
  const line = (await admin.from("order_lines").select("id").eq("order_id", o.order_id).single()).data!.id;
  await runCommand("record_pick", { orderId: o.order_id, picks: [{ lineId: line, qty: 1 }] }, ctx);
  const result = await runCommand("ship_order", { orderId: o.order_id, ship: [{ lineId: line, qty: 1, sources: [{ binId: bin, lotId: lots[0], qty: 1, toBinId: dest.binId }] }] }, ctx) as { invoice_id: string | null };
  expect(result.invoice_id).toBeNull();
  expect((await admin.from("inventory_movements").select("bin_id,lot_id,qty").eq("ref", o.order_id)).data).toEqual(expect.arrayContaining([{ bin_id: bin, lot_id: lots[0], qty: -1 }, { bin_id: dest.binId, lot_id: lots[0], qty: 1 }]));
});
it("cross-location material receipts preserve selected lot and reject rounded source quantities", async () => {
  const dest = await seedLocation(ctx.breweryId, { name: "Material destination" });
  const material = await seedMaterial(ctx.breweryId, { name: "Trace malt", category: "malt", lotTracked: true });
  const lot = await ins("material_lots", { brewery_id: ctx.breweryId, material_id: material, lot_code: "MALT-1" });
  await ins("material_movements", { brewery_id: ctx.breweryId, material_id: material, location_id: loc.id, bin_id: bin, lot_id: lot.id, qty: 10, type: "opening_balance", created_by: ctx.userId });
  const tr = await runCommand("create_stock_transfer", { fromLocationId: loc.id, toLocationId: dest.id, lines: [{ materialId: material, qty: 2, fromBinId: bin, toBinId: dest.binId }] }, ctx) as { transferId: string };
  await runCommand("submit_stock_transfer", tr, ctx);
  const line = (await admin.from("stock_transfer_lines").select("id").eq("transfer_id", tr.transferId).single()).data!.id;
  await runCommand("record_stock_transfer_pick", { ...tr, picks: [{ lineId: line, qty: 2 }] }, ctx);
  await expect(runCommand("receive_stock_transfer", { ...tr, lines: [{ lineId: line, qty: 0.00001, sources: [{ lotId: lot.id, qty: 0.00001 }] }] }, ctx)).rejects.toThrow(/four decimals/);
  await runCommand("receive_stock_transfer", { ...tr, lines: [{ lineId: line, qty: 2, sources: [{ lotId: lot.id, qty: 2 }] }] }, ctx);
  expect((await admin.from("material_movements").select("lot_id,qty").eq("material_id", material).neq("type", "opening_balance")).data).toEqual(expect.arrayContaining([{ lot_id: lot.id, qty: -2 }, { lot_id: lot.id, qty: 2 }]));
});

it("submits the real return form payload for a manual invoice without inventing shipment sources", async () => {
  const invoice = await ins("invoices", { brewery_id: ctx.breweryId, customer_id: cust.customerId, kind: "invoice" });
  const line = await ins("invoice_lines", { brewery_id: ctx.breweryId, invoice_id: invoice.id, kind: "sku", sku_id: cat.skuId, qty: 2, unit_price_cents: 12000, description: "Manual invoice" });
  const lines = buildReturnLines([{ id: line.id, skuId: cat.skuId, label: "Beer", qty: 2 }], { [line.id]: "1" }, [], {}, "", null);
  await expect(runCommand("return_shipment", { invoiceId: invoice.id, locationId: loc.id, reason: "unsold", lines }, ctx)).resolves.toBeDefined();
  expect(buildReturnLines([{ id: line.id, skuId: cat.skuId, label: "Beer", qty: 2 }], { [line.id]: "1" }, [], {}, "", crypto.randomUUID())[0].sources).toEqual([]);
});

it("compares parsed UUID identity for ship lines, return lines and return sources", async () => {
  const o = await order(2);
  const other = await seedCatalog(ctx.breweryId, { product: "Alias second brand", sku: "Alias second SKU" });
  await ins("order_lines", { brewery_id: ctx.breweryId, order_id: o.id, sku_id: other.skuId, qty_ordered: 1, unit_price_cents: 100 });
  const alias = o.line.replaceAll("-", "");
  const bad = await ctx.db.rpc("ship_order", { p_order: o.id, p_ship: [{ line_id: o.line, qty_shipped: 0 }, { line_id: alias, qty_shipped: 0 }], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() });
  expect(bad.error?.message).toMatch(/line/);
  expect((await admin.from("shipments").select("id").eq("order_id", o.id)).data).toEqual([]);
  const shippedOrder = await order(2);
  const shipped = await runCommand("ship_order", { orderId: shippedOrder.id, ship: [{ lineId: shippedOrder.line, qty: 2, sources: [{ binId: bin, lotId: lots[0], qty: 2 }] }] }, ctx) as { invoice_id: string };
  const movement = (await admin.from("inventory_movements").select("id").eq("ref", shippedOrder.id).single()).data!.id;
  const line = (await admin.from("invoice_lines").select("id").eq("invoice_id", shipped.invoice_id).single()).data!.id;
  const emptySourceLines = buildReturnLines([{ id: line, skuId: cat.skuId, label: "Beer", qty: 2 }], { [line]: "1" }, [], {}, bin, shipped.invoice_id);
  await expect(runCommand("return_shipment", { invoiceId: shipped.invoice_id, locationId: loc.id, reason: "unsold", lines: emptySourceLines }, ctx)).rejects.toThrow(/sources/);
  for (const lines of [
    [{ invoice_line_id: line, qty: 0.25, sources: [{ movement_id: movement, bin_id: bin, qty: 0.25 }] }, { invoice_line_id: line.replaceAll("-", ""), qty: 0.25, sources: [{ movement_id: movement, bin_id: bin, qty: 0.25 }] }],
    [{ invoice_line_id: line, qty: 0.5, sources: [{ movement_id: movement, bin_id: bin, qty: 0.25 }, { movement_id: movement.replaceAll("-", ""), bin_id: bin, qty: 0.25 }] }],
  ]) {
    const requestId = crypto.randomUUID();
    const r = await ctx.db.rpc("return_shipment", { p_invoice: shipped.invoice_id, p_lines: lines, p_location: loc.id, p_reason: "unsold", p_request_id: requestId });
    expect(r.error?.message).toMatch(/duplicate|distinct/);

    expect((await admin.from("inventory_movements").select("id").eq("source_movement_id", movement)).data).toHaveLength(lines.length === 2 ? 0 : 1);
    expect((await admin.from("invoice_lines").select("id").eq("credited_invoice_line_id", line)).data).toHaveLength(lines.length === 2 ? 0 : 1);
    const valid = { p_invoice: shipped.invoice_id, p_lines: [{ invoice_line_id: line, qty: 0.25, sources: [{ movement_id: movement, bin_id: bin, qty: 0.25 }] }], p_location: loc.id, p_reason: "unsold", p_request_id: requestId };
    const ok = await ctx.db.rpc("return_shipment", valid); expect(ok.error).toBeNull();
    expect((await ctx.db.rpc("return_shipment", valid)).data).toEqual(ok.data);

  }
});
it("rejects UUID aliases in transfer line and source arrays before completion", async () => {
  const dest = await seedLocation(ctx.breweryId, { name: "Alias transfer destination" });
  const tr = await runCommand("create_stock_transfer", { fromLocationId: loc.id, toLocationId: dest.id, lines: [{ skuId: cat.skuId, qty: 1, fromBinId: bin, toBinId: dest.binId }] }, ctx) as { transferId: string };
  await runCommand("submit_stock_transfer", tr, ctx);
  const line = (await admin.from("stock_transfer_lines").select("id").eq("transfer_id", tr.transferId).single()).data!.id;
  await runCommand("record_stock_transfer_pick", { ...tr, picks: [{ lineId: line, qty: 1 }] }, ctx);
  for (const lines of [
    [{ line_id: line, qty: 1, sources: [{ lot_id: lots[0], qty: 1 }] }, { line_id: line.replaceAll("-", ""), qty: 1, sources: [{ lot_id: lots[0], qty: 1 }] }],
    [{ line_id: line, qty: 1, sources: [{ lot_id: lots[0], qty: 0.5 }, { lot_id: lots[0].replaceAll("-", ""), qty: 0.5 }] }],
  ]) {
    const r = await ctx.db.rpc("receive_stock_transfer", { p_transfer: tr.transferId, p_lines: lines, p_request_id: crypto.randomUUID() });
    expect(r.error?.message).toMatch(/coverage|distinct/);
    expect((await admin.from("inventory_movements").select("id").eq("ref", tr.transferId)).data).toEqual([]);
  }
});
