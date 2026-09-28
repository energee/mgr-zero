import { describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedLocation, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

async function received(qty = 10) {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "warehouse");
  const location = await seedLocation(brewery.id);
  const vendor = await runCommand("upsert_vendor", { name: "Receipt supplier" }, ctx) as { id: string };
  const material = await runCommand("upsert_material", {
    name: "Receipt malt", category: "malt", baseUom: "lb", purchaseUom: "each", purchaseUomFactor: 5, lotTracked: true,
  }, ctx) as { id: string };
  const po = await runCommand("create_purchase_order", {
    vendorId: vendor.id, lines: [{ materialId: material.id, qtyOrdered: 10, unitCostCents: 250 }],
  }, ctx) as { id: string };
  await runCommand("send_purchase_order", { poId: po.id, sentVia: "external" }, ctx);
  const detail = await runCommand("get_purchase_order", { poId: po.id }, ctx) as { lines: { id: string }[] };
  const lineId = detail.lines[0].id;
  const receipt = await runCommand("receive_purchase_order", {
    poId: po.id, locationId: location.id, binId: location.binId, receivedOn: "2026-09-20",
    lines: [{ poLineId: lineId, qtyCounted: qty, lotCode: "ORIGINAL", bestBy: "2027-01-01" }],
  }, ctx) as { receipt_id: string };
  return { brewery, ctx, location, material, po, lineId, receiptId: receipt.receipt_id };
}

describe("immutable receipt correction", () => {
  it("replaces the counted receipt, preserves its original facts, and replays without posting twice", async () => {
    const f = await received();
    const requestId = crypto.randomUUID();
    const input = { receiptId: f.receiptId, reason: "Counted sealed bags twice", lines: [{ poLineId: f.lineId, qtyCounted: 6, lotCode: "ACTUAL", bestBy: "2027-02-01" }] };
    const result = await runCommand("correct_purchase_receipt", input, f.ctx, { requestId, correlationId: requestId }) as { receipt_id: string; status: string };
    expect(result.status).toBe("partially_received");
    expect(await runCommand("correct_purchase_receipt", input, f.ctx, { requestId, correlationId: requestId })).toEqual(result);
    expect((await admin.from("receipt_lines").select("qty_counted").eq("receipt_id", f.receiptId)).data).toEqual([{ qty_counted: 10 }]);
    expect(sql(`select sum(qty) from public.material_movements where material_id='${f.material.id}'`)).toEqual(["30.0000"]);
    expect(sql(`select qty_received,qty_open from public.po_open_balances where po_line_id='${f.lineId}'`)).toEqual(["6.0000|4.0000"]);
    expect(sql(`select count(*) from public.material_movements where material_id='${f.material.id}'`)).toEqual(["3"]);
    await expect(runCommand("correct_purchase_receipt", input, f.ctx)).rejects.toThrow(/already|superseded|reload/i);
  });

  it("refuses a consumed receipt without reversing stock or creating a revision", async () => {
    const f = await received();
    const { data: line } = await admin.from("receipt_lines").select("lot_id").eq("receipt_id", f.receiptId).single();
    const used = await admin.from("material_movements").insert({ brewery_id: f.brewery.id, material_id: f.material.id,
      location_id: f.location.id, bin_id: f.location.binId, lot_id: line!.lot_id!, qty: -1, type: "consumption", created_by: f.ctx.userId });
    expect(used.error).toBeNull();
    await expect(runCommand("correct_purchase_receipt", {
      receiptId: f.receiptId, reason: "Wrong count", lines: [{ poLineId: f.lineId, qtyCounted: 9, lotCode: "ORIGINAL" }],
    }, f.ctx)).rejects.toThrow(/used|consum|subsequent|dependency/i);
    expect((await admin.from("receipts").select("id").eq("po_id", f.po.id)).data).toHaveLength(1);
    expect(sql(`select sum(qty) from public.material_movements where material_id='${f.material.id}'`)).toEqual(["49.0000"]);
  });

  it("retains another receipt's contribution and permits a zero-count replacement", async () => {
    const f = await received(4);
    await runCommand("receive_purchase_order", {
      poId: f.po.id, locationId: f.location.id, binId: f.location.binId,
      lines: [{ poLineId: f.lineId, qtyCounted: 6, lotCode: "SECOND" }],
    }, f.ctx);
    await runCommand("correct_purchase_receipt", {
      receiptId: f.receiptId, reason: "Nothing actually arrived", lines: [{ poLineId: f.lineId, qtyCounted: 0 }],
    }, f.ctx);
    expect(sql(`select qty_received,qty_open from public.po_open_balances where po_line_id='${f.lineId}'`)).toEqual(["6.0000|4.0000"]);
    expect(sql(`select sum(qty) from public.material_movements where material_id='${f.material.id}'`)).toEqual(["30.0000"]);
  });
});

it("uses frozen receipt conversion after master edits and keeps a later receipt's cost current", async () => {
  const f = await received();
  const vendor = await runCommand("upsert_vendor", { name: "Later supplier" }, f.ctx) as { id: string };
  const laterPo = await runCommand("create_purchase_order", {
    vendorId: vendor.id, lines: [{ materialId: f.material.id, qtyOrdered: 1, unitCostCents: 500 }],
  }, f.ctx) as { id: string };
  await runCommand("send_purchase_order", { poId: laterPo.id, sentVia: "external" }, f.ctx);
  const later = await runCommand("get_purchase_order", { poId: laterPo.id }, f.ctx) as { lines: { id: string }[] };
  await runCommand("receive_purchase_order", {
    poId: laterPo.id, locationId: f.location.id, binId: f.location.binId,
    lines: [{ poLineId: later.lines[0].id, qtyCounted: 1, lotCode: "LATER" }],
  }, f.ctx);
  // Simulate old master edits that predate today's unit guard.
  sql(`update public.materials set name='Renamed master',purchase_uom_factor=7 where id='${f.material.id}'`);
  const corrected = await runCommand("correct_purchase_receipt", {
    receiptId: f.receiptId, reason: "Six bags arrived", lines: [{ poLineId: f.lineId, qtyCounted: 6, lotCode: "ORIGINAL", bestBy: "2027-01-01" }],
  }, f.ctx) as { receipt_id: string };
  expect(sql(`select material_name,purchase_uom_factor,qty_counted from public.receipt_lines where receipt_id='${corrected.receipt_id}'`)[0].split("|").map((v, i) => i ? Number(v) : v)).toEqual(["Receipt malt", 5, 6]);
  expect(sql(`select sum(qty) from public.material_movements where material_id='${f.material.id}'`)).toEqual(["35.0000"]);
  expect(Number(sql(`select unit_cost_cents from public.material_last_cost where material_id='${f.material.id}'`)[0])).toBe(100);
});

it("rejects another tenant, a disallowed role and UUID aliases without writing a successor", async () => {
  const f = await received();
  const input = { receiptId: f.receiptId, reason: "Wrong count", lines: [{ poLineId: f.lineId, qtyCounted: 6, lotCode: "ORIGINAL" }] };
  const outsider = await makeStaffCtx((await makeBrewery()).id, "admin");
  await expect(runCommand("correct_purchase_receipt", input, outsider)).rejects.toThrow(/not found|permission/i);
  await expect(runCommand("correct_purchase_receipt", input, await makeStaffCtx(f.brewery.id, "sales"))).rejects.toThrow(/permission/i);
  await expect(runCommand("correct_purchase_receipt", { ...input, lines: [...input.lines, { ...input.lines[0], poLineId: f.lineId.toUpperCase() }] }, f.ctx)).rejects.toThrow(/exactly once/i);
  expect((await admin.from("receipts").select("id").eq("po_id", f.po.id)).data).toHaveLength(1);
});

it("preserves original lot facts and rejects best-by edits to a shared lot", async () => {
  const f = await received(4);
  await runCommand("receive_purchase_order", {
    poId: f.po.id, locationId: f.location.id, binId: f.location.binId,
    lines: [{ poLineId: f.lineId, qtyCounted: 6, lotCode: "ORIGINAL", bestBy: "2027-01-01" }],
  }, f.ctx);
  await expect(runCommand("correct_purchase_receipt", {
    receiptId: f.receiptId, reason: "Wrong best-by", lines: [{ poLineId: f.lineId, qtyCounted: 4, lotCode: "ORIGINAL", bestBy: "2028-01-01" }],
  }, f.ctx)).rejects.toThrow(/shared|used lot/i);
  expect(sql(`select lot_best_by from public.receipt_lines where receipt_id='${f.receiptId}'`)).toEqual(["2027-01-01"]);
  expect((await admin.from("material_lots").select("best_by").eq("material_id", f.material.id)).data).toEqual([{ best_by: "2027-01-01" }]);
});

it("serializes competing corrections and keeps one effective receipt", async () => {
  const f = await received();
  const results = await Promise.allSettled([6, 7].map(qtyCounted => runCommand("correct_purchase_receipt", {
    receiptId: f.receiptId, reason: "Concurrent recount", lines: [{ poLineId: f.lineId, qtyCounted, lotCode: "ORIGINAL", bestBy: "2027-01-01" }],
  }, f.ctx)));
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  expect((await admin.from("receipts").select("id").eq("po_id", f.po.id)).data).toHaveLength(2);
});

it("corrects an exclusive unused lot best-by while preserving every revision", async () => {
  const f = await received();
  const corrected = await runCommand("correct_purchase_receipt", {
    receiptId: f.receiptId, reason: "Best-by read incorrectly", lines: [{ poLineId: f.lineId, qtyCounted: 10, lotCode: "ORIGINAL", bestBy: "2028-01-01" }],
  }, f.ctx) as { receipt_id: string };
  expect(sql(`select lot_best_by from public.receipt_lines where receipt_id='${f.receiptId}'`)).toEqual(["2027-01-01"]);
  expect(sql(`select lot_best_by from public.receipt_lines where receipt_id='${corrected.receipt_id}'`)).toEqual(["2028-01-01"]);
  await runCommand("correct_purchase_receipt", {
    receiptId: corrected.receipt_id, reason: "Second recount", lines: [{ poLineId: f.lineId, qtyCounted: 8, lotCode: "ORIGINAL", bestBy: "2028-01-01" }],
  }, f.ctx);
  expect(sql(`select sum(qty) from public.material_movements where material_id='${f.material.id}'`)).toEqual(["40.0000"]);
  expect(sql(`select qty_received from public.po_open_balances where po_line_id='${f.lineId}'`)).toEqual(["8.0000"]);
});

it("corrects a new zero receipt but refuses missing historical conversion facts", async () => {
  const f = await received(0);
  const corrected = await runCommand("correct_purchase_receipt", {
    receiptId: f.receiptId, reason: "One bag was overlooked", lines: [{ poLineId: f.lineId, qtyCounted: 1, lotCode: "FOUND" }],
  }, f.ctx) as { receipt_id: string };
  expect(sql(`select sum(qty) from public.material_movements where material_id='${f.material.id}'`)).toEqual(["5.0000"]);
  expect(corrected.receipt_id).not.toBe(f.receiptId);
  const legacy = await received(0);
  sql(`update public.receipt_lines set purchase_uom_factor=null where receipt_id='${legacy.receiptId}'`);
  await expect(runCommand("correct_purchase_receipt", {
    receiptId: legacy.receiptId, reason: "Unknown old units", lines: [{ poLineId: legacy.lineId, qtyCounted: 1, lotCode: "UNKNOWN" }],
  }, legacy.ctx)).rejects.toThrow(/historical.*conversion/i);
  expect((await admin.from("receipts").select("id").eq("po_id", legacy.po.id)).data).toHaveLength(1);
});
