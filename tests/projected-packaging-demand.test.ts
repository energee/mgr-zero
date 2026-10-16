import { describe, expect, it } from "vitest";
import { admin, asUser, ins, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation, seedMovement, sql } from "./helpers";
import { rawDatabase } from "./raw-database";
import { closeWithConfirmedMaterials } from "./packaging-fixture";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Fixture = {
  brewery: { id: string };
  ctx: Ctx;
  catalog: { brandId: string; formatId: string; skuId: string };
  location: { id: string; binId: string };
  labelId: string;
};

// Every scenario gets its own tenant, stock, BOM and allocations. No test relies
// on another test having received stock, cancelled a run or configured a share.
async function fixture(purchaseUomFactor = 1): Promise<Fixture> {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id);
  const catalog = await seedCatalog(brewery.id, { bblPerUnit: 0.3 });
  const location = await seedLocation(brewery.id);
  const material = await runCommand("upsert_material", {
    name: "Projected labels", category: "packaging", baseUom: "each", purchaseUom: "each", purchaseUomFactor,
  }, ctx) as { id: string };
  const labelId = material.id;
  await runCommand("replace_format_bom", { formatId: catalog.formatId, lines: [{ materialId: labelId, qtyPerUnit: 1 }] }, ctx);
  return { brewery, ctx, catalog, location, labelId };
}

async function requirements(f: Fixture, ctx = f.ctx) {
  const result = await ctx.db.from("material_requirements")
    .select("material_id, required, projected, needed_by")
    .eq("brewery_id", f.brewery.id).eq("material_id", f.labelId);
  expect(result.error).toBeNull();
  return result.data;
}

async function stock(f: Fixture, qty: number, type: "opening_balance" | "production_in" = "opening_balance") {
  await runCommand("record_movement", {
    skuId: f.catalog.skuId, locationId: f.location.id, binId: f.location.binId, type, qty,
  }, f.ctx);
}

async function order(f: Fixture, qty: number, requestedShipDate?: string) {
  const customer = await seedCustomer(f.brewery.id, { name: `Order customer ${crypto.randomUUID()}` });
  await priceSku(f.brewery.id, { saleChannelId: customer.saleChannelId, brandId: f.catalog.brandId, formatId: f.catalog.formatId, cents: 3600 });
  const created = await runCommand("create_order", {
    kind: "wholesale", customerId: customer.customerId, shipToId: customer.shipToId,
    fromLocationId: f.location.id, requestedShipDate, lines: [{ skuId: f.catalog.skuId, qty }],
  }, f.ctx) as { order_id: string };
  await runCommand("submit_order", { orderId: created.order_id }, f.ctx);
  await runCommand("confirm_order", { orderId: created.order_id }, f.ctx);
  return created.order_id;
}

async function standing(f: Fixture, qty: number) {
  const tap = await seedLocation(f.brewery.id, { name: "Taproom", uses: ["taproom"] });
  await runCommand("set_standing_allocation", { locationId: tap.id, skuId: f.catalog.skuId, qty }, f.ctx);
}

async function run(f: Fixture, qty: number, occupancyId?: string) {
  return await runCommand("schedule_packaging_run", {
    brandId: f.catalog.brandId, plannedOn: "2026-11-20", occupancyId,
    outputs: [{ skuId: f.catalog.skuId, qtyPlanned: qty }],
  }, f.ctx) as { id: string };
}

async function batch(f: Fixture, share: number | null = 0.5) {
  if (share !== null) await runCommand("update_sku", { skuId: f.catalog.skuId, active: true, batchShare: share }, f.ctx);
  return await runCommand("schedule_batch", {
    intendedBrandId: f.catalog.brandId, plannedOn: "2026-11-01", plannedBbl: 10,
  }, f.ctx) as { id: string };
}

async function brew(f: Fixture, batchId: string, brewedOn = "2026-11-03") {
  const vessel = await runCommand("upsert_vessel", { name: "Projection tank", kind: "fermenter", capacityBbl: 20 }, f.ctx) as { id: string };
  return await runCommand("record_brew_day", {
    batchId, vesselId: vessel.id, initialBbl: 10, brewedOn, actuals: [], confirmEmpty: true,
  }, f.ctx) as { occupancy: { id: string } };
}

const execution = () => ({ requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });

// SQL's current_date is the contract, not the test runner's local timezone.
const day = (offset = 0) => sql(`select (current_date + ${offset})::text`, true)[0];

describe("order packaging projections", () => {
  it("projects only a confirmed order's units beyond stock, at the earliest requested date, with numeric command output", async () => {
    const f = await fixture();
    await stock(f, 100);
    await order(f, 80, "2026-11-20");
    expect(await requirements(f)).toEqual([]);
    await order(f, 50, "2026-11-10");
    expect(await requirements(f)).toEqual([{ material_id: f.labelId, required: 30, projected: 30, needed_by: "2026-11-10" }]);
    const rows = await runCommand("get_material_requirements", {}, f.ctx) as { material_id: string; required: number; projected: number }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ material_id: f.labelId, required: 30, projected: 30 });
    expect(rows[0].projected).toBeTypeOf("number");
  });

  it("falls back to the database's today when no open order has a requested date", async () => {
    const f = await fixture();
    await order(f, 7);
    expect(await requirements(f)).toEqual([{ material_id: f.labelId, required: 7, projected: 7, needed_by: day() }]);
  });

  it("replaces projected order units with run units instead of adding both, preserving a partial projected balance", async () => {
    const f = await fixture();
    await order(f, 80, "2026-11-25");
    await run(f, 30);
    expect(await requirements(f)).toEqual([{ material_id: f.labelId, required: 80, projected: 50, needed_by: "2026-11-20" }]);
    await run(f, 50);
    expect(await requirements(f)).toEqual([{ material_id: f.labelId, required: 80, projected: 0, needed_by: "2026-11-20" }]);
    await run(f, 10);
    expect(await requirements(f)).toEqual([{ material_id: f.labelId, required: 90, projected: 0, needed_by: "2026-11-20" }]);
  });

  it("removes projected order demand as finished stock is received", async () => {
    const f = await fixture();
    await order(f, 80, "2026-11-25");
    await stock(f, 30, "production_in");
    expect(await requirements(f)).toEqual([{ material_id: f.labelId, required: 50, projected: 50, needed_by: "2026-11-25" }]);
    await stock(f, 50, "production_in");
    expect(await requirements(f)).toEqual([]);
    const moves = await admin.from("inventory_movements").select("type, qty").eq("brewery_id", f.brewery.id).order("qty");
    expect(moves.error).toBeNull();
    expect(moves.data).toEqual([{ type: "production_in", qty: 30 }, { type: "production_in", qty: 50 }]);
  });

  it("does not project a standing allocation on its own", async () => {
    const f = await fixture();
    await standing(f, 50);
    expect(await requirements(f)).toEqual([]);
    const shortfall = await f.ctx.db.rpc("order_packaging_shortfall_rows");
    expect(shortfall.error).toBeNull();
    expect(shortfall.data).toEqual([]);
  });

  it.each([{ onHand: 100, orders: 80, expected: 30 }, { onHand: 0, orders: 10, expected: 10 }])(
    "caps mixed standing/order demand at $expected with $onHand stock and $orders ordered", async ({ onHand, orders, expected }) => {
      const f = await fixture();
      if (onHand) await stock(f, onHand);
      await standing(f, 50);
      await order(f, orders, "2026-11-25");
      expect(await requirements(f)).toEqual([{ material_id: f.labelId, required: expected, projected: expected, needed_by: "2026-11-25" }]);
    },
  );

  it("shows the same aggregate to admin and brewer without exposing orders, and isolates foreign staff and portal users", async () => {
    const f = await fixture();
    await order(f, 12, "2026-11-25");
    const brewer = await makeStaffCtx(f.brewery.id, "brewer");
    expect(await requirements(f, brewer)).toEqual(await requirements(f));
    expect(await runCommand("get_material_requirements", {}, brewer)).toEqual(await runCommand("get_material_requirements", {}, f.ctx));
    const hiddenOrders = await brewer.db.from("orders").select("id").eq("brewery_id", f.brewery.id);
    expect(hiddenOrders.error).toBeNull();
    expect(hiddenOrders.data).toEqual([]);
    const foreign = await makeStaffCtx((await makeBrewery()).id);
    expect(await requirements(f, foreign)).toEqual([]);
    expect(await runCommand("get_material_requirements", {}, foreign)).toEqual([]);
    const foreignShortfall = await foreign.db.rpc("order_packaging_shortfall_rows");
    expect(foreignShortfall.error).toBeNull();
    expect(foreignShortfall.data).toEqual([]);
    const customer = await seedCustomer(f.brewery.id);
    const user = await makeCustomerUser(customer.customerId);
    const portal = { db: await asUser(user.email), userId: user.id, breweryId: f.brewery.id, role: "customer" as const, customerId: customer.customerId };
    const portalShortfall = await portal.db.rpc("order_packaging_shortfall_rows");
    expect(portalShortfall.error).toBeNull();
    expect(portalShortfall.data).toEqual([]);
    const portalRequirements = await portal.db.from("material_requirements").select("material_id").eq("brewery_id", f.brewery.id);
    expect(portalRequirements.error).toBeNull();
    expect(portalRequirements.data).toEqual([]);
    await expect(runCommand("get_material_requirements", {}, portal)).rejects.toThrow(/permission denied/);
  });

  it("rounds each-unit BOM demand per source while keeping one material row for firm and projected demand", async () => {
    const f = await fixture();
    await runCommand("replace_format_bom", { formatId: f.catalog.formatId, lines: [{ materialId: f.labelId, qtyPerUnit: 0.25 }] }, f.ctx);
    await order(f, 6, "2026-11-25");
    await run(f, 3);
    // Each source needs ceil(3 * .25) = 1, not ceil(6 * .25) = 2 projected.
    expect(await requirements(f)).toEqual([{ material_id: f.labelId, required: 2, projected: 1, needed_by: "2026-11-20" }]);
  });

  it("drafts projected material by the ordinary vendor, purchase-unit and buy-by rules", async () => {
    const f = await fixture(10);
    const vendor = await runCommand("upsert_vendor", { name: "Label supplier", leadTimeDays: 7 }, f.ctx) as { id: string };
    await runCommand("upsert_material", { id: f.labelId, name: "Projected labels", category: "packaging", baseUom: "each", purchaseUom: "each", purchaseUomFactor: 10, defaultVendorId: vendor.id }, f.ctx);
    await order(f, 23, day(30));
    await seedMovement(f.brewery.id, { materialId: f.labelId, locationId: f.location.id, binId: f.location.binId, qty: 3, createdBy: f.ctx.userId });
    const drafted = await runCommand("draft_purchase_order_from_requirements", { materialIds: [f.labelId] }, f.ctx) as { purchaseOrderIds: string[]; skipped: unknown[] };
    expect(drafted.skipped).toEqual([]);
    expect(drafted.purchaseOrderIds).toHaveLength(1);
    const po = await runCommand("get_purchase_order", { poId: drafted.purchaseOrderIds[0] }, f.ctx) as { status: string; vendor_id: string; lines: { material_id: string; qty_ordered: number }[] };
    expect(po).toMatchObject({ status: "draft", vendor_id: vendor.id });
    expect(po.lines).toMatchObject([{ material_id: f.labelId, qty_ordered: 2 }]);
    await runCommand("send_purchase_order", { poId: drafted.purchaseOrderIds[0], sentVia: "external" }, f.ctx);
    const covered = await runCommand("get_material_requirements", {}, f.ctx) as { projected: number; on_order: number; short: number }[];
    expect(covered).toMatchObject([{ projected: 23, on_order: 20, short: 0 }]);
  });
});

describe("batch package shares", () => {
  it("configures a share only after creation, preserves omission, clears null, and replays without applying it twice", async () => {
    const f = await fixture();
    const format = await runCommand("upsert_format", { name: "Second format", basis: "packaged", packageType: "can", bblPerUnit: 0.1 }, f.ctx) as { id: string };
    const sku = await runCommand("create_sku", { brandId: f.catalog.brandId, formatId: format.id }, f.ctx) as { id: string; batch_share: number | null };
    expect(sku.batch_share).toBeNull();
    const request = execution();
    const input = { skuId: sku.id, active: true, batchShare: 0.5 };
    const saved = await runCommand("update_sku", input, f.ctx, request);
    expect(saved).toMatchObject({ batch_share: 0.5 });
    expect(await runCommand("update_sku", input, f.ctx, request)).toEqual(saved);
    await expect(runCommand("update_sku", { ...input, batchShare: 0.6 }, f.ctx, request)).rejects.toThrow(/different payload/);
    expect(await runCommand("update_sku", { skuId: sku.id, active: false }, f.ctx)).toMatchObject({ batch_share: 0.5 });
    expect(await runCommand("update_sku", { skuId: sku.id, active: true, batchShare: null }, f.ctx)).toMatchObject({ batch_share: null });
    const stored = await admin.from("skus").select("batch_share, active").eq("id", sku.id).single();
    expect(stored.error).toBeNull();
    expect(stored.data).toEqual({ batch_share: null, active: true });
  });

  it("rejects nonpositive and over-one shares at both command and RPC boundaries, and rejects a brand total above one atomically", async () => {
    const f = await fixture();
    for (const batchShare of [0, -0.1, 1.2]) {
      await expect(runCommand("update_sku", { skuId: f.catalog.skuId, active: true, batchShare }, f.ctx)).rejects.toThrow();
      const invalid = await rawDatabase(f.ctx.db).rpc("update_sku", { p_brewery: f.brewery.id, p_id: f.catalog.skuId, p_active: true, p_upc: null, p_batch_share: batchShare, p_request_id: crypto.randomUUID() });
      expect(invalid.error).not.toBeNull();
    }
    await runCommand("update_sku", { skuId: f.catalog.skuId, active: true, batchShare: 0.6 }, f.ctx);
    const format = await runCommand("upsert_format", { name: "Second share", basis: "packaged", packageType: "can", bblPerUnit: 0.1 }, f.ctx) as { id: string };
    const second = await runCommand("create_sku", { brandId: f.catalog.brandId, formatId: format.id }, f.ctx) as { id: string };
    await expect(runCommand("update_sku", { skuId: second.id, active: false, batchShare: 0.5 }, f.ctx)).rejects.toThrow();
    const untouched = await admin.from("skus").select("active, batch_share").eq("id", second.id).single();
    expect(untouched.error).toBeNull();
    expect(untouched.data).toEqual({ active: true, batch_share: null });
    expect(await runCommand("update_sku", { skuId: second.id, active: true, batchShare: 0.4 }, f.ctx)).toMatchObject({ batch_share: 0.4 });
  });

  it("serializes simultaneous SKU share edits against one brand's remaining volume", async () => {
    const f = await fixture();
    const format = await runCommand("upsert_format", { name: "Concurrent share", basis: "packaged", packageType: "can", bblPerUnit: 0.1 }, f.ctx) as { id: string };
    const second = await runCommand("create_sku", { brandId: f.catalog.brandId, formatId: format.id }, f.ctx) as { id: string };
    const outcomes = await Promise.allSettled([f.catalog.skuId, second.id].map(skuId =>
      runCommand("update_sku", { skuId, active: true, batchShare: 0.6 }, f.ctx)));
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(1);
    const rows = await admin.from("skus").select("batch_share").eq("brand_id", f.catalog.brandId);
    expect(rows.error).toBeNull();
    expect(rows.data?.reduce((sum, row) => sum + Number(row.batch_share), 0)).toBe(0.6);
  });

  it("keeps share edits behind the existing staff role and tenant mutation boundary", async () => {
    const f = await fixture();
    const brewer = await makeStaffCtx(f.brewery.id, "brewer");
    const foreign = await makeStaffCtx((await makeBrewery()).id);
    const payload = { p_brewery: f.brewery.id, p_id: f.catalog.skuId, p_active: true, p_upc: null, p_batch_share: 0.5 };
    for (const denied of [brewer, foreign]) {
      const result = await denied.db.rpc("update_sku", { ...payload, p_request_id: crypto.randomUUID() });
      expect(result.error).not.toBeNull();
    }
    const unchanged = await admin.from("skus").select("batch_share").eq("id", f.catalog.skuId).single();
    expect(unchanged.error).toBeNull();
    expect(unchanged.data).toEqual({ batch_share: null });
  });

  it("replays an accepted pre-share SKU edit unchanged when the share is omitted", async () => {
    const f = await fixture();
    await runCommand("update_sku", { skuId: f.catalog.skuId, active: true, batchShare: 0.5 }, f.ctx);
    const requestId = crypto.randomUUID();
    const legacy = { id: f.catalog.skuId, active: false, upc: null };
    sql(`insert into private.command_requests(actor_id,brewery_id,request_id,command_name,payload_hash,result)
      values('${f.ctx.userId}','${f.brewery.id}','${requestId}','update_sku',
        extensions.digest(jsonb_build_object('brewery','${f.brewery.id}'::uuid,'id','${f.catalog.skuId}'::uuid,'active',false,'upc',null)::text,'sha256'),
        '${JSON.stringify(legacy)}'::jsonb)`);
    const replay = { requestId, correlationId: requestId };
    expect(await runCommand("update_sku", { skuId: f.catalog.skuId, active: false }, f.ctx, replay)).toEqual(legacy);
    await expect(runCommand("update_sku", { skuId: f.catalog.skuId, active: false, batchShare: null }, f.ctx, replay)).rejects.toThrow(/different payload/);
    const current = await admin.from("skus").select("active, batch_share").eq("id", f.catalog.skuId).single();
    expect(current.error).toBeNull();
    expect(current.data).toEqual({ active: true, batch_share: 0.5 });
  });
});

describe("batch packaging projections", () => {
  it("floors planned batch volume times SKU share over format volume and uses planned date plus brewery days", async () => {
    const f = await fixture();
    await runCommand("set_brewery_operating_defaults", { readingDueHours: 24, daysToPackage: 21 }, f.ctx);
    await batch(f);
    // floor(10 bbl * .5 / .3 bbl per unit), not rounded to 17 units.
    expect(await requirements(f)).toEqual([{ material_id: f.labelId, required: 16, projected: 16, needed_by: "2026-11-22" }]);
  });

  it("uses brewed date instead of planned date once the brew day is recorded", async () => {
    const f = await fixture();
    const planned = await batch(f);
    await brew(f, planned.id);
    expect(await requirements(f)).toEqual([{ material_id: f.labelId, required: 16, projected: 16, needed_by: "2026-11-17" }]);
  });

  it("replaces the whole batch projection when an occupancy-linked run exists, and restores it when the run is cancelled", async () => {
    const f = await fixture();
    const planned = await batch(f);
    const brewed = await brew(f, planned.id);
    const scheduled = await run(f, 10, brewed.occupancy.id);
    expect(await requirements(f)).toEqual([{ material_id: f.labelId, required: 10, projected: 0, needed_by: "2026-11-20" }]);
    await runCommand("cancel_packaging_run", { runId: scheduled.id }, f.ctx);
    expect(await requirements(f)).toEqual([{ material_id: f.labelId, required: 16, projected: 16, needed_by: "2026-11-17" }]);
  });

  it("takes projected batch/order demand through a real run close into stock without resurrecting projection", async () => {
    const f = await fixture();
    const planned = await batch(f);
    await order(f, 10, day(30));
    expect(await requirements(f)).toMatchObject([{ required: 16, projected: 16 }]);
    const brewed = await brew(f, planned.id, day(-5));
    const scheduled = await run(f, 16, brewed.occupancy.id);
    expect(await requirements(f)).toMatchObject([{ required: 16, projected: 0 }]);
    await seedMovement(f.brewery.id, { materialId: f.labelId, locationId: f.location.id, binId: f.location.binId, qty: 16, createdBy: f.ctx.userId });
    await runCommand("update_packaging_run", { runId: scheduled.id, startedAt: new Date().toISOString() }, f.ctx);
    await closeWithConfirmedMaterials({
      runId: scheduled.id, bblDrawn: 4.8, outputs: [{ skuId: f.catalog.skuId, qtyActual: 16 }],
      lotCode: "PROJECTION-REPLACED", packagedOn: day(-1), locationId: f.location.id, binId: f.location.binId,
    }, f.ctx);
    expect(await requirements(f)).toEqual([]);
    const balance = await f.ctx.db.from("on_hand").select("qty").eq("sku_id", f.catalog.skuId).single();
    expect(balance.error).toBeNull();
    expect(Number(balance.data?.qty)).toBe(16);
    const consumed = await admin.from("material_movements").select("qty").eq("material_id", f.labelId).eq("type", "consumption");
    expect(consumed.error).toBeNull();
    expect(consumed.data).toEqual([{ qty: -16 }]);
  });

  it("also replaces a projection through a direct batch link, without requiring an occupancy", async () => {
    const f = await fixture();
    const planned = await batch(f);
    // Current scheduling is tankless/occupancy-first; seed the other supported
    // durable link explicitly so this branch cannot accidentally rely on a tank.
    const linked = await ins("packaging_runs", { brewery_id: f.brewery.id, brand_id: f.catalog.brandId, batch_id: planned.id, planned_on: "2026-11-20", created_by: f.ctx.userId });
    await ins("packaging_run_outputs", { brewery_id: f.brewery.id, run_id: linked.id, sku_id: f.catalog.skuId, qty_planned: 10 });
    expect(await requirements(f)).toEqual([{ material_id: f.labelId, required: 10, projected: 0, needed_by: "2026-11-20" }]);
    await runCommand("cancel_packaging_run", { runId: linked.id }, f.ctx);
    expect(await requirements(f)).toEqual([{ material_id: f.labelId, required: 16, projected: 16, needed_by: "2026-11-15" }]);
  });

  it.each(["direct", "occupancy"] as const)("does not resurrect projection after a %s-linked run is closed", async (link) => {
    const f = await fixture();
    const planned = await batch(f);
    const brewed = link === "occupancy" ? await brew(f, planned.id) : null;
    const linked = await ins("packaging_runs", {
      brewery_id: f.brewery.id, brand_id: f.catalog.brandId,
      batch_id: link === "direct" ? planned.id : null, occupancy_id: brewed?.occupancy.id ?? null,
      planned_on: "2026-11-20", started_at: "2026-11-20T12:00:00Z", closed_at: "2026-11-20T13:00:00Z", created_by: f.ctx.userId,
    });
    await ins("packaging_run_outputs", { brewery_id: f.brewery.id, run_id: linked.id, sku_id: f.catalog.skuId, qty_planned: 10, qty_actual: 10 });
    // The batch remains open: it is the closed run's link that suppresses it.
    expect(await requirements(f)).toEqual([]);
    const currentBatch = await admin.from("batches").select("closed_at").eq("id", planned.id).single();
    expect(currentBatch.error).toBeNull();
    expect(currentBatch.data).toEqual({ closed_at: null });
  });

  it("retains the documented tankless unlinked run gap until its tank is picked", async () => {
    const f = await fixture();
    await batch(f);
    await run(f, 10);
    expect(await requirements(f)).toEqual([{ material_id: f.labelId, required: 26, projected: 16, needed_by: "2026-11-15" }]);
  });

  it.each(["cancelled", "closed"] as const)("excludes a %s batch", async (state) => {
    const f = await fixture();
    const planned = await batch(f);
    if (state === "cancelled") await runCommand("cancel_batch", { batchId: planned.id }, f.ctx);
    else sql(`update public.batches set brewed_on = '2026-11-03', closed_at = '2026-11-20T13:00:00Z' where id = '${planned.id}'`);
    expect(await requirements(f)).toEqual([]);
  });

  it.each([{ ordered: 10, total: 16 }, { ordered: 25, total: 25 }])(
    "counts the same SKU's $ordered order units and its batch supply only once", async ({ ordered, total }) => {
      const f = await fixture();
      await batch(f);
      await order(f, ordered, "2026-11-25");
      expect(await requirements(f)).toEqual([{ material_id: f.labelId, required: total, projected: total, needed_by: "2026-11-15" }]);
    },
  );

  it("does not project a SKU with no share, an inactive SKU, or a share too small for one unit", async () => {
    const f = await fixture();
    await batch(f, null);
    expect(await requirements(f)).toEqual([]);
    await runCommand("update_sku", { skuId: f.catalog.skuId, active: false, batchShare: 0.5 }, f.ctx);
    expect(await requirements(f)).toEqual([]);
    await runCommand("update_sku", { skuId: f.catalog.skuId, active: true, batchShare: 0.01 }, f.ctx);
    expect(await requirements(f)).toEqual([]);
  });
});
