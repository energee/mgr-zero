// tests/purchasing.test.ts — Program 6: vendors, materials, contracts, POs
// (draft → mark sent → receive), planning drafts, and material cycle counts.
// Lead time lives on the vendor (spec 2026-09-07 §3); a PO status is derived
// from counted receipts and an empty PO never looks received (§2).
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedLocation, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let b: { id: string };
let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
beforeAll(async () => {
  b = await makeBrewery();
  ctx = await makeStaffCtx(b.id, "warehouse");
});

describe("schema: lead time and PO status derivation", () => {
  it("lead_time_days lives on vendors; materials has no such column", () => {
    const col = (t: string) => sql(`select column_name from information_schema.columns
      where table_schema='public' and table_name='${t}' and column_name='lead_time_days'`);
    expect(col("vendors")).toEqual(["lead_time_days"]);
    expect(col("materials")).toEqual([]);
  });

  it("a PO with no lines derives no status (the trigger leaves it alone)", () => {
    // bool_and over zero rows is NULL; before the guard that read as partially_received.
    expect(sql(`select private.po_receipt_status('00000000-0000-4000-8000-000000000000'::uuid) is null`)).toEqual(["t"]);
  });
});

describe("vendors, materials, contracts", () => {
  it("creates and edits a vendor, a material with a default vendor, and a contract; the list joins them", async () => {
    const ych = (await runCommand("upsert_vendor", { name: "YCH", email: "orders@ych.example", leadTimeDays: 14 }, ctx)) as { id: string; lead_time_days: number };
    expect(ych.lead_time_days).toBe(14);
    const renamed = (await runCommand("upsert_vendor", { id: ych.id, name: "YCH Hops", leadTimeDays: 10, paymentTerms: "net15" }, ctx)) as { name: string; payment_terms: string };
    expect(renamed).toMatchObject({ name: "YCH Hops", payment_terms: "net15" });

    const citra = (await runCommand("upsert_material", {
      name: "Citra", category: "hop", baseUom: "lb", purchaseUom: "each", purchaseUomFactor: 44, lotTracked: true, defaultVendorId: ych.id,
    }, ctx)) as { id: string; default_vendor_id: string; purchase_uom_factor: number };
    expect(citra.default_vendor_id).toBe(ych.id);

    const contract = (await runCommand("upsert_material_contract", {
      vendorId: ych.id, materialId: citra.id, qtyCommitted: 400, unitCostCents: 1250, contractNo: "Citra 2026",
    }, ctx)) as { id: string };

    const vendors = (await runCommand("list_vendors_and_contracts", {}, ctx)) as {
      id: string; name: string; lead_time_days: number;
      contracts: { id: string; material_id: string; qty_committed: number; qty_received: number; qty_on_order: number; qty_available: number }[];
    }[];
    expect(vendors.map((v) => v.name)).toEqual(["YCH Hops"]);
    expect(vendors[0].contracts).toEqual([{
      id: contract.id, vendor_id: ych.id, material_id: citra.id, material_name: "Citra", contract_no: "Citra 2026", unit_cost_cents: 1250,
      starts_on: null, ends_on: null, qty_committed: 400, qty_received: 0, qty_on_order: 0, qty_available: 400,
    }]);

    const materials = (await runCommand("list_materials", {}, ctx)) as { id: string; default_vendor_id: string; purchase_uom_factor: number; lot_tracked: boolean }[];
    expect(materials.find((m) => m.id === citra.id)).toMatchObject({ default_vendor_id: ych.id, purchase_uom_factor: 44, lot_tracked: true });

    // Pickers read the thin list, not the contract report.
    expect(await runCommand("list_vendors", {}, ctx)).toEqual([{ id: ych.id, name: "YCH Hops", active: true, lead_time_days: 10 }]);
  });

  it("a sales user may not edit vendors", async () => {
    const sales = await makeStaffCtx(b.id, "sales");
    await expect(runCommand("upsert_vendor", { name: "Nope" }, sales)).rejects.toThrow(/permission/i);
  });
});

describe("purchase orders: draft, mark sent, receive", () => {
  it("records an overreceipt once and makes the missing damage/disposition contract explicit", async () => {
    const wh = await seedLocation(b.id, { name: "Overreceipt dock" });
    const vendor = await runCommand("upsert_vendor", { name: "Variance supplier" }, ctx) as { id: string };
    const material = await runCommand("upsert_material", {
      name: "Overage cans", category: "packaging", baseUom: "each", purchaseUom: "each",
    }, ctx) as { id: string };
    const po = await runCommand("create_purchase_order", {
      vendorId: vendor.id, lines: [{ materialId: material.id, qtyOrdered: 10, unitCostCents: 25 }],
    }, ctx) as { id: string };
    await runCommand("send_purchase_order", { poId: po.id, sentVia: "external" }, ctx);
    const detail = await runCommand("get_purchase_order", { poId: po.id }, ctx) as { lines: { id: string }[] };
    const requestId = crypto.randomUUID();
    const input = { poId: po.id, locationId: wh.id, binId: wh.binId, receivedOn: "2026-09-19", lines: [{ poLineId: detail.lines[0].id, qtyCounted: 12 }] };
    const first = await runCommand("receive_purchase_order", input, ctx, { requestId, correlationId: requestId }) as { receipt_id: string; status: string };
    const replay = await runCommand("receive_purchase_order", input, ctx, { requestId, correlationId: requestId });

    expect(replay).toEqual(first);
    expect(first.status).toBe("received");
    expect((await admin.from("receipt_lines").select("qty_expected, qty_counted, variance").eq("receipt_id", first.receipt_id)).data)
      .toEqual([{ qty_expected: 10, qty_counted: 12, variance: 2 }]);
    expect((await admin.from("material_movements").select("qty, type").eq("material_id", material.id)).data)
      .toEqual([{ qty: 12, type: "receipt" }]);
    expect((await admin.from("receipts").select("id").eq("po_id", po.id)).data).toHaveLength(1);

    // R05's damaged quantity and supplier disposition are not representable in
    // the current receipt schema. Keep that boundary executable until designed.
    expect(sql(`select column_name from information_schema.columns
      where table_schema='public' and table_name in ('receipts','receipt_lines')
        and column_name in ('damaged_qty','supplier_disposition','disposition')`)).toEqual([]);
  });

  it("draft → sent (mailto) → partial receipt → received; open balance and status derive from counts", async () => {
    const wh = await seedLocation(b.id);
    const vendor = (await runCommand("upsert_vendor", { name: "Country Malt", leadTimeDays: 7 }, ctx)) as { id: string };
    const malt = (await runCommand("upsert_material", { name: "2-row", category: "malt", baseUom: "lb", purchaseUom: "each", purchaseUomFactor: 55, lotTracked: true }, ctx)) as { id: string };
    const hulls = (await runCommand("upsert_material", { name: "Rice hulls", category: "adjunct", baseUom: "lb", purchaseUom: "each", purchaseUomFactor: 50 }, ctx)) as { id: string };

    const po = (await runCommand("create_purchase_order", {
      vendorId: vendor.id, expectedOn: "2026-09-10",
      lines: [
        { materialId: malt.id, qtyOrdered: 4, unitCostCents: 2850, expectedLotCode: "CM-26-4410" },
        { materialId: hulls.id, qtyOrdered: 6, unitCostCents: 62 },
      ],
    }, ctx)) as { id: string; status: string; po_no: number };
    expect(po.status).toBe("draft");
    expect(po.po_no).toBeGreaterThan(0);

    // Receiving a draft is refused: sent is the state that means awaiting receipt.
    await expect(runCommand("receive_purchase_order", { poId: po.id, locationId: wh.id, binId: wh.binId, lines: [{ poLineId: crypto.randomUUID(), qtyCounted: 1 }] }, ctx)).rejects.toThrow(/draft/);

    const sent = (await runCommand("send_purchase_order", { poId: po.id, sentVia: "mailto" }, ctx)) as { status: string; sent_via: string; sent_by: string; ordered_on: string };
    expect(sent).toMatchObject({ status: "sent", sent_via: "mailto", sent_by: ctx.userId });
    expect(sent.ordered_on).toBeTruthy();
    await expect(runCommand("send_purchase_order", { poId: po.id, sentVia: "external" }, ctx)).rejects.toThrow(/sent/);

    const detail = (await runCommand("get_purchase_order", { poId: po.id }, ctx)) as { lines: { id: string; material_id: string; qty_ordered: number; qty_received: number; qty_open: number }[] };
    const maltLine = detail.lines.find((l) => l.material_id === malt.id)!;
    const hullsLine = detail.lines.find((l) => l.material_id === hulls.id)!;
    expect(maltLine).toMatchObject({ qty_ordered: 4, qty_received: 0, qty_open: 4 });

    // 3 of 4 malt bags on a substituted lot, all 6 hulls: partially received, one bag open.
    const receipt = (await runCommand("receive_purchase_order", {
      poId: po.id, locationId: wh.id, binId: wh.binId, receivedOn: "2026-09-11",
      lines: [
        { poLineId: maltLine.id, qtyCounted: 3, lotCode: "CM-26-4288", bestBy: "2027-03-31" },
        { poLineId: hullsLine.id, qtyCounted: 6 },
      ],
    }, ctx)) as { status: string; receipt_id: string };
    expect(receipt.status).toBe("partially_received");

    const after = (await runCommand("get_purchase_order", { poId: po.id }, ctx)) as { status: string; lines: { material_id: string; qty_received: number; qty_open: number }[] };
    expect(after.status).toBe("partially_received");
    expect(after.lines.find((l) => l.material_id === malt.id)).toMatchObject({ qty_received: 3, qty_open: 1 });
    expect(after.lines.find((l) => l.material_id === hulls.id)).toMatchObject({ qty_received: 6, qty_open: 0 });

    // Ledger: base units (3 bags × 55 lb), the lot read off the package, the hulls untracked.
    const moves = await admin.from("material_movements").select("material_id, qty, type, lot_id, bin_id").eq("brewery_id", b.id).in("material_id", [malt.id, hulls.id]).order("qty");
    expect(moves.data).toHaveLength(2);
    expect(moves.data!.find((m) => m.material_id === malt.id)).toMatchObject({ qty: 165, type: "receipt", bin_id: wh.binId });
    expect(moves.data!.find((m) => m.material_id === hulls.id)).toMatchObject({ qty: 300, lot_id: null });
    const lot = await admin.from("material_lots").select("lot_code, vendor_id, best_by").eq("material_id", malt.id);
    expect(lot.data).toEqual([{ lot_code: "CM-26-4288", vendor_id: vendor.id, best_by: "2027-03-31" }]);

    // Replaying the same request does not double-receive.
    const requestId = crypto.randomUUID();
    const first = await runCommand("receive_purchase_order", { poId: po.id, locationId: wh.id, binId: wh.binId, receivedOn: "2026-09-18", lines: [{ poLineId: maltLine.id, qtyCounted: 1, lotCode: "CM-26-4288" }] }, ctx, { requestId, correlationId: requestId });
    const replay = await runCommand("receive_purchase_order", { poId: po.id, locationId: wh.id, binId: wh.binId, receivedOn: "2026-09-18", lines: [{ poLineId: maltLine.id, qtyCounted: 1, lotCode: "CM-26-4288" }] }, ctx, { requestId, correlationId: requestId });
    expect(replay).toEqual(first);
    expect((await admin.from("receipts").select("id").eq("po_id", po.id)).data).toHaveLength(2);

    const done = (await runCommand("get_purchase_order", { poId: po.id }, ctx)) as { status: string };
    expect(done.status).toBe("received");

    // Observed lead time: sent 2026-09-?? (today) → last receipt 09-18; promised 09-10. One PO, tagged mailto.
    const lead = (await runCommand("list_vendors_and_contracts", {}, ctx)) as { id: string; observed: { sent_via: string; n: number; avg_lead_days: number; avg_late_days: number }[] }[];
    const cm = lead.find((v) => v.id === vendor.id)!;
    expect(cm.observed).toHaveLength(1);
    expect(cm.observed[0]).toMatchObject({ sent_via: "mailto", n: 1, avg_late_days: 8 });

    const list = (await runCommand("list_purchase_orders", {}, ctx)) as { id: string }[];
    expect(list.map((p) => p.id)).not.toContain(po.id);            // received POs leave the open list
    const all = (await runCommand("list_purchase_orders", { includeClosed: true }, ctx)) as { id: string; vendor_name: string; status: string }[];
    expect(all.find((p) => p.id === po.id)).toMatchObject({ vendor_name: "Country Malt", status: "received" });
  });

  it("a contracted line must be the PO vendor's contract for that material; a receipt needs a counted line; a cancelled draft is legal", async () => {
    const a = (await runCommand("upsert_vendor", { name: "Vendor A" }, ctx)) as { id: string };
    const bVendor = (await runCommand("upsert_vendor", { name: "Vendor B" }, ctx)) as { id: string };
    const hop = (await runCommand("upsert_material", { name: "Idaho 7", category: "hop", baseUom: "lb", purchaseUom: "lb" }, ctx)) as { id: string };
    const bContract = (await runCommand("upsert_material_contract", { vendorId: bVendor.id, materialId: hop.id, qtyCommitted: 100, unitCostCents: 900 }, ctx)) as { id: string };
    await expect(runCommand("create_purchase_order", { vendorId: a.id, lines: [{ materialId: hop.id, qtyOrdered: 5, contractId: bContract.id }] }, ctx)).rejects.toThrow(/contract/);
    const po = (await runCommand("create_purchase_order", { vendorId: bVendor.id, lines: [{ materialId: hop.id, qtyOrdered: 5, contractId: bContract.id }] }, ctx)) as { id: string };
    expect((await admin.from("purchase_order_lines").select("unit_cost_cents").eq("po_id", po.id)).data).toEqual([{ unit_cost_cents: 900 }]);   // contract price by default
    // An unsent PO can be cancelled without ever having a transport.
    expect((await admin.from("purchase_orders").update({ status: "cancelled" }).eq("id", po.id).select("status")).data).toEqual([{ status: "cancelled" }]);
    const wh = await seedLocation(b.id, { name: "Dock" });
    const sentPo = (await runCommand("create_purchase_order", { vendorId: bVendor.id, lines: [{ materialId: hop.id, qtyOrdered: 5 }] }, ctx)) as { id: string };
    await runCommand("send_purchase_order", { poId: sentPo.id, sentVia: "external" }, ctx);
    await expect(runCommand("receive_purchase_order", { poId: sentPo.id, locationId: wh.id, binId: wh.binId, lines: [] }, ctx)).rejects.toThrow();
  });

  it("editing a material without a reorder point keeps the one it had", async () => {
    const m = (await runCommand("upsert_material", { name: "Caramel 60", category: "malt", baseUom: "lb", purchaseUom: "lb", reorderPoint: 200 }, ctx)) as { id: string; reorder_point: number };
    const edited = (await runCommand("upsert_material", { id: m.id, name: "Caramel 60L", category: "malt", baseUom: "lb", purchaseUom: "lb" }, ctx)) as { reorder_point: number };
    expect(Number(edited.reorder_point)).toBe(200);
  });

  it("a PO needs at least one line, and a contract never gates ordering", async () => {
    const vendor = (await runCommand("upsert_vendor", { name: "Spot Hops" }, ctx)) as { id: string };
    const hop = (await runCommand("upsert_material", { name: "Mosaic", category: "hop", baseUom: "lb", purchaseUom: "lb" }, ctx)) as { id: string };
    await expect(runCommand("create_purchase_order", { vendorId: vendor.id, lines: [] }, ctx)).rejects.toThrow();
    const po = (await runCommand("create_purchase_order", { vendorId: vendor.id, lines: [{ materialId: hop.id, qtyOrdered: 20, unitCostCents: 1800 }] }, ctx)) as { id: string };
    expect(po.id).toBeTruthy();
  });
});

describe("planning: draft purchase orders from material gaps", () => {
  it("one draft per resolved vendor, gap rounded up to the purchase unit; a material with no vendor is skipped", async () => {
    const brewer = await makeStaffCtx(b.id, "admin");
    const cm = (await runCommand("upsert_vendor", { name: "Country Malt Group", leadTimeDays: 5 }, ctx)) as { id: string };
    const pale = (await runCommand("upsert_material", { name: "Pale malt", category: "malt", baseUom: "lb", purchaseUom: "each", purchaseUomFactor: 55, defaultVendorId: cm.id }, ctx)) as { id: string };
    const wheat = (await runCommand("upsert_material", { name: "Wheat malt", category: "malt", baseUom: "lb", purchaseUom: "each", purchaseUomFactor: 55, defaultVendorId: cm.id }, ctx)) as { id: string };
    const orphan = (await runCommand("upsert_material", { name: "Mystery yeast", category: "yeast", baseUom: "each", purchaseUom: "each" }, ctx)) as { id: string };
    // 90 days out on a 2026-10-01 need: buy-by is already past, so it is out of reach.
    const slow = (await runCommand("upsert_vendor", { name: "Slow Boat Rice", leadTimeDays: 90 }, ctx)) as { id: string };
    const hulls = (await runCommand("upsert_material", { name: "Slow-boat rice hulls", category: "adjunct", baseUom: "lb", purchaseUom: "lb", defaultVendorId: slow.id }, ctx)) as { id: string };

    // A 10 bbl unbrewed batch needs 600 lb pale, 100 lb wheat, 2 yeast; 130 lb pale is on hand.
    const recipe = (await runCommand("create_recipe", { name: "Wheat Ale" }, brewer)) as { id: string };
    const version = (await runCommand("create_recipe_version", {
      recipeId: recipe.id, mashTempF: 152, brewhouseEfficiency: 0.75, yeastAttenuation: 0.78,
      ingredients: [
        { materialId: pale.id, perBblQty: 60, stage: "mash" },
        { materialId: wheat.id, perBblQty: 10, stage: "mash" },
        { materialId: orphan.id, perBblQty: 0.2, stage: "fermentation" },
        { materialId: hulls.id, perBblQty: 1, stage: "mash" },
      ],
    }, brewer)) as { id: string };
    await runCommand("schedule_batch", { recipeVersionId: version.id, plannedOn: "2026-10-01", plannedBbl: 10 }, brewer);
    const wh = await seedLocation(b.id, { name: "Grain room" });
    await admin.from("material_movements").insert({ brewery_id: b.id, material_id: pale.id, location_id: wh.id, bin_id: wh.binId, qty: 130, type: "opening_balance", created_by: ctx.userId });

    const reqs = (await runCommand("get_material_requirements", {}, ctx)) as {
      material_id: string; required: number; on_hand: number; on_order: number; short: number; needed_by: string;
      vendor_id: string | null; vendor_name: string | null; lead_time_days: number | null; contract_id: string | null; purchase_units_short: number;
      buy_by: string | null; out_of_reach: boolean;
    }[];
    expect(reqs.find((r) => r.material_id === pale.id)).toMatchObject({ required: 600, on_hand: 130, on_order: 0, short: 470, needed_by: "2026-10-01", vendor_id: cm.id, vendor_name: "Country Malt Group", lead_time_days: 5, purchase_units_short: 9, buy_by: "2026-09-26", out_of_reach: false });
    expect(reqs.find((r) => r.material_id === orphan.id)).toMatchObject({ short: 2, vendor_id: null, buy_by: null, out_of_reach: false });
    expect(reqs.find((r) => r.material_id === hulls.id)).toMatchObject({ vendor_id: slow.id, buy_by: "2026-07-03", out_of_reach: true });

    // Out of reach and no vendor are both reported, never drafted (the RPC owns the rule, not the page).
    const drafted = (await runCommand("draft_purchase_order_from_requirements", { materialIds: [pale.id, wheat.id, orphan.id, hulls.id] }, ctx)) as {
      purchaseOrderIds: string[]; skipped: { materialId: string; reason: string }[];
    };
    expect(drafted.purchaseOrderIds).toHaveLength(1);
    expect(drafted.skipped.sort((x, y) => x.reason.localeCompare(y.reason))).toEqual([{ materialId: orphan.id, reason: "no_vendor" }, { materialId: hulls.id, reason: "out_of_reach" }]);
    const po = (await runCommand("get_purchase_order", { poId: drafted.purchaseOrderIds[0] }, ctx)) as { status: string; vendor_id: string; lines: { material_id: string; qty_ordered: number }[] };
    expect(po).toMatchObject({ status: "draft", vendor_id: cm.id });
    expect(po.lines.map((l) => [l.material_id, l.qty_ordered]).sort()).toEqual([[pale.id, 9], [wheat.id, 2]].sort());

    // The draft is not yet supply (only a sent PO is on order), so the gap stands until it is marked sent.
    const again = (await runCommand("get_material_requirements", {}, ctx)) as { material_id: string; on_order: number }[];
    expect(again.find((r) => r.material_id === pale.id)!.on_order).toBe(0);
  });
});

describe("material cycle count", () => {
  it("equal count writes only the header; a shortage posts one negative count_adjustment", async () => {
    const wh = await seedLocation(b.id, { name: "Packaging store" });
    const cans = (await runCommand("upsert_material", { name: "Cans 16 oz", category: "packaging", baseUom: "each", purchaseUom: "each" }, ctx)) as { id: string };
    await admin.from("material_movements").insert({ brewery_id: b.id, material_id: cans.id, location_id: wh.id, bin_id: wh.binId, qty: 3100, type: "opening_balance", created_by: ctx.userId });

    const same = (await runCommand("record_material_count", { locationId: wh.id, binId: wh.binId, lines: [{ materialId: cans.id, qty: 3100 }] }, ctx)) as { id: string; lines: { material_id: string; qty_expected: number; qty_counted: number; movement_ids: string[] }[] };
    expect(same.lines).toEqual([{ material_id: cans.id, qty_expected: 3100, qty_counted: 3100, movement_ids: [] }]);
    expect((await admin.from("material_counts").select("id, location_id, bin_id").eq("id", same.id)).data).toEqual([{ id: same.id, location_id: wh.id, bin_id: wh.binId }]);

    const short = (await runCommand("record_material_count", { locationId: wh.id, binId: wh.binId, lines: [{ materialId: cans.id, qty: 3050 }] }, ctx)) as { lines: { movement_ids: string[] }[] };
    expect(short.lines[0].movement_ids).toHaveLength(1);
    const moves = await admin.from("material_movements").select("qty, type, lot_id").eq("material_id", cans.id).eq("type", "count_adjustment");
    expect(moves.data).toEqual([{ qty: -50, type: "count_adjustment", lot_id: null }]);
  });

  it("a shortage consumes earliest best-by first and may split across lots; an overage lands on the newest lot", async () => {
    const wh = await seedLocation(b.id, { name: "Hop freezer" });
    const hop = (await runCommand("upsert_material", { name: "Simcoe", category: "hop", baseUom: "lb", purchaseUom: "lb", lotTracked: true }, ctx)) as { id: string };
    const lot = async (code: string, bestBy: string | null, receivedOn: string, qty: number) => {
      const { data } = await admin.from("material_lots").insert({ brewery_id: b.id, material_id: hop.id, lot_code: code, best_by: bestBy, received_on: receivedOn }).select("id").single();
      await admin.from("material_movements").insert({ brewery_id: b.id, material_id: hop.id, location_id: wh.id, bin_id: wh.binId, lot_id: data!.id, qty, type: "receipt", created_by: ctx.userId });
      return data!.id as string;
    };
    const old = await lot("S-24", "2026-12-01", "2026-01-10", 10);   // expires first
    const mid = await lot("S-25", "2027-06-01", "2026-06-10", 20);
    const fresh = await lot("S-26", null, "2026-09-01", 30);        // no best-by: behind those that have one; newest receipt

    // 60 on hand, counted 45: −10 from S-24 (all of it), −5 from S-25.
    const short = (await runCommand("record_material_count", { locationId: wh.id, binId: wh.binId, lines: [{ materialId: hop.id, qty: 45 }] }, ctx)) as { lines: { movement_ids: string[] }[] };
    expect(short.lines[0].movement_ids).toHaveLength(2);
    const after = await admin.from("material_movements").select("lot_id, qty").eq("material_id", hop.id).eq("type", "count_adjustment").order("qty");
    expect(after.data).toEqual([{ lot_id: old, qty: -10 }, { lot_id: mid, qty: -5 }]);

    // 45 on hand, counted 50: +5 on the newest lot.
    await runCommand("record_material_count", { locationId: wh.id, binId: wh.binId, lines: [{ materialId: hop.id, qty: 50 }] }, ctx);
    const over = await admin.from("material_movements").select("lot_id, qty").eq("material_id", hop.id).eq("type", "count_adjustment").gt("qty", 0);
    expect(over.data).toEqual([{ lot_id: fresh, qty: 5 }]);
  });
});
