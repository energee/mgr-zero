import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { admin, closePgSessions, makeBrewery, makeStaffCtx, pgSession, seedLocation, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

afterEach(closePgSessions);
const receiptResult = z.object({ receipt_id: z.string().uuid() });

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

  it("corrects a consumed receipt without rewriting its consumption or allowing negative stock", async () => {
    const f = await received();
    const { data: line } = await admin.from("receipt_lines").select("lot_id").eq("receipt_id", f.receiptId).single();
    const used = await admin.from("material_movements").insert({ brewery_id: f.brewery.id, material_id: f.material.id,
      location_id: f.location.id, bin_id: f.location.binId, lot_id: line!.lot_id!, qty: -1, type: "consumption", created_by: f.ctx.userId });
    expect(used.error).toBeNull();
    await expect(runCommand("correct_purchase_receipt", {
      receiptId: f.receiptId, reason: "Below amount already used", lines: [{ poLineId: f.lineId, qtyCounted: 0.1, lotCode: "ORIGINAL", bestBy: "2027-01-01" }],
    }, f.ctx)).rejects.toThrow(/negative material stock/i);
    expect((await admin.from("receipts").select("id").eq("po_id", f.po.id)).data).toHaveLength(1);
    await runCommand("correct_purchase_receipt", {
      receiptId: f.receiptId, reason: "Wrong count", lines: [{ poLineId: f.lineId, qtyCounted: 9, lotCode: "ORIGINAL", bestBy: "2027-01-01" }],
    }, f.ctx);
    expect((await admin.from("receipts").select("id").eq("po_id", f.po.id)).data).toHaveLength(2);
    expect(sql(`select sum(qty) from public.material_movements where material_id='${f.material.id}'`)).toEqual(["44.0000"]);
    expect(sql(`select qty from public.material_movements where material_id='${f.material.id}' and type='consumption'`)).toEqual(["-1.0000"]);
  });

  it("corrects the receiving bin while preserving the original receipt location", async () => {
    const f = await received();
    const destination = await seedLocation(f.brewery.id, { name: "Actual receiving location" });
    const corrected = await runCommand("correct_purchase_receipt", {
      receiptId: f.receiptId, reason: "Received in storage", locationId: destination.id, binId: destination.binId,
      lines: [{ poLineId: f.lineId, qtyCounted: 10, lotCode: "ORIGINAL", bestBy: "2027-01-01" }],
    }, f.ctx) as { receipt_id: string };
    expect((await admin.from("receipts").select("location_id,bin_id").eq("id", f.receiptId).single()).data)
      .toEqual({ location_id: f.location.id, bin_id: f.location.binId });
    expect((await admin.from("receipts").select("location_id,bin_id").eq("id", corrected.receipt_id).single()).data)
      .toEqual({ location_id: destination.id, bin_id: destination.binId });
    expect(sql(`select sum(qty) from public.material_movements where material_id='${f.material.id}' and bin_id='${f.location.binId}'`)).toEqual(["0.0000"]);
    expect(sql(`select sum(qty) from public.material_movements where material_id='${f.material.id}' and bin_id='${destination.binId}'`)).toEqual(["50.0000"]);
  });

  it("preserves actual cost and destination through the single correction RPC and exact replay", async () => {
    const f = await received();
    const destination = await seedLocation(f.brewery.id, { name: "Correct receiving warehouse" });
    const input = {
      p_brewery: f.brewery.id, p_receipt: f.receiptId, p_reason: "Invoice and receiving bin corrected",
      p_lines: [{ po_line_id: f.lineId, qty_counted: 10, unit_cost_cents: 1251, lot_code: "ORIGINAL", best_by: "2027-01-01" }],
      p_request_id: crypto.randomUUID(), p_location: destination.id, p_bin: destination.binId,
    };
    const first = await f.ctx.db.rpc("correct_purchase_receipt", input);
    expect(first.error).toBeNull();
    const corrected = receiptResult.parse(first.data);
    expect((await f.ctx.db.rpc("correct_purchase_receipt", input)).data).toEqual(first.data);
    const conflicting = await f.ctx.db.rpc("correct_purchase_receipt", { ...input, p_lines: [{ ...input.p_lines[0], unit_cost_cents: 1252 }] });
    expect(conflicting.error).not.toBeNull();
    expect(sql(`select location_id,bin_id from public.receipts where id='${corrected.receipt_id}'`)).toEqual([`${destination.id}|${destination.binId}`]);
    expect(sql(`select rl.purchase_unit_cost_cents,m.unit_cost_cents,m.qty from public.receipt_lines rl join public.material_movements m on m.id=rl.movement_id where rl.receipt_id='${corrected.receipt_id}'`)[0].split("|").map(Number)).toEqual([1251, 250.2, 50]);
    expect(sql(`select sum(qty) from public.material_movements where material_id='${f.material.id}' and bin_id='${f.location.binId}'`)).toEqual(["0.0000"]);
    expect(sql(`select sum(qty) from public.material_movements where material_id='${f.material.id}' and bin_id='${destination.binId}'`)).toEqual(["50.0000"]);
    expect(sql(`select purchase_unit_cost_cents from public.receipt_lines where receipt_id='${f.receiptId}'`)).toEqual(["250"]);
  });

  it("allows a safe same-bin price correction after use but refuses moving consumed stock or another tenant's bin", async () => {
    const f = await received();
    const { data: line } = await admin.from("receipt_lines").select("lot_id").eq("receipt_id", f.receiptId).single();
    const used = await admin.from("material_movements").insert({ brewery_id: f.brewery.id, material_id: f.material.id,
      location_id: f.location.id, bin_id: f.location.binId, lot_id: line!.lot_id!, qty: -1, type: "consumption", created_by: f.ctx.userId });
    expect(used.error).toBeNull();
    const input = {
      p_brewery: f.brewery.id, p_receipt: f.receiptId, p_reason: "Invoice price corrected",
      p_lines: [{ po_line_id: f.lineId, qty_counted: 10, unit_cost_cents: 1251, lot_code: "ORIGINAL", best_by: "2027-01-01" }],
      p_request_id: crypto.randomUUID(), p_location: f.location.id, p_bin: f.location.binId,
    };
    const corrected = await f.ctx.db.rpc("correct_purchase_receipt", input);
    expect(corrected.error).toBeNull();
    const receiptId = receiptResult.parse(corrected.data).receipt_id;
    const destination = await seedLocation(f.brewery.id, { name: "Other receiving warehouse" });
    const moved = await f.ctx.db.rpc("correct_purchase_receipt", { ...input, p_receipt: receiptId, p_request_id: crypto.randomUUID(), p_location: destination.id, p_bin: destination.binId });
    expect(moved.error?.message).toMatch(/negative material stock/i);
    const foreign = await seedLocation((await makeBrewery()).id, { name: "Foreign receiving warehouse" });
    const denied = await f.ctx.db.rpc("correct_purchase_receipt", { ...input, p_receipt: receiptId, p_request_id: crypto.randomUUID(), p_location: foreign.id, p_bin: foreign.binId });
    expect(denied.error?.message).toMatch(/receiving bin in this brewery/i);
    expect((await admin.from("receipts").select("id").eq("po_id", f.po.id)).data).toHaveLength(2);
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

// #1234: autovacuum's SHARE UPDATE EXCLUSIVE lasts a moment; the correction
// retries its lock set instead of refusing at the first conflict.
it("corrects once a brief autovacuum-mode lock on material lots is released", async () => {
  const f = await received();
  const holder = await pgSession();
  await holder.query("begin; lock table public.material_lots in share update exclusive mode");
  const released = new Promise(resolve => setTimeout(resolve, 300)).then(() => holder.query("commit"));
  await runCommand("correct_purchase_receipt", {
    receiptId: f.receiptId, reason: "Recount", lines: [{ poLineId: f.lineId, qtyCounted: 6, lotCode: "ORIGINAL", bestBy: "2027-01-01" }],
  }, f.ctx);
  await released;
  expect((await admin.from("receipts").select("id").eq("po_id", f.po.id)).data).toHaveLength(2);
});

it("refuses as a retryable conflict, not a server error, when material stock stays busy", async () => {
  const f = await received();
  const writer = await pgSession();
  await writer.query("begin; lock table public.material_movements in row exclusive mode");
  await expect(runCommand("correct_purchase_receipt", {
    receiptId: f.receiptId, reason: "Recount", lines: [{ poLineId: f.lineId, qtyCounted: 6, lotCode: "ORIGINAL", bestBy: "2027-01-01" }],
  }, f.ctx)).rejects.toMatchObject({ code: "conflict", status: 409, message: expect.stringContaining("busy") });
  await writer.query("rollback");
  expect((await admin.from("receipts").select("id").eq("po_id", f.po.id)).data).toHaveLength(1);
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

// A pre-#680 receipt froze no receiving location and, with no count, no
// movement to read one from: the correction names that gap, not a bin chooser
// the form never showed.
it("refuses a historical receipt with no frozen receiving location as historical, not as a missing bin", async () => {
  const legacy = await received(0);
  sql(`update public.receipts set location_id=null,bin_id=null where id='${legacy.receiptId}'`);
  await expect(runCommand("correct_purchase_receipt", {
    receiptId: legacy.receiptId, reason: "One bag was overlooked", lines: [{ poLineId: legacy.lineId, qtyCounted: 1, lotCode: "FOUND" }],
  }, legacy.ctx)).rejects.toThrow(/historical receipt has no frozen receiving location/i);
  expect((await admin.from("receipts").select("id").eq("po_id", legacy.po.id)).data).toHaveLength(1);
});

it("retains purchase and base quantity precision when an actual receipt cost is supplied", async () => {
  const f = await received(0);
  const vendor = await runCommand("upsert_vendor", { name: "Precise invoice supplier" }, f.ctx) as { id: string };
  const material = await runCommand("upsert_material", {
    name: "Precise invoice hops", category: "hop", baseUom: "lb", purchaseUom: "kg", purchaseUomFactor: 2.2046,
  }, f.ctx) as { id: string };
  const po = await runCommand("create_purchase_order", { vendorId: vendor.id, lines: [{ materialId: material.id, qtyOrdered: 20 }] }, f.ctx) as { id: string };
  await runCommand("send_purchase_order", { poId: po.id, sentVia: "external" }, f.ctx);
  const detail = await runCommand("get_purchase_order", { poId: po.id }, f.ctx) as { lines: { id: string }[] };
  const input = {
    p_brewery: f.brewery.id, p_po: po.id, p_location: f.location.id, p_bin: f.location.binId, p_received_on: "2026-09-20",
    p_lines: [{ po_line_id: detail.lines[0].id, qty_counted: 0.33333, unit_cost_cents: 1000 }], p_request_id: crypto.randomUUID(),
  };
  expect((await f.ctx.db.rpc("receive_purchase_order", input)).error?.message).toMatch(/four decimals/i);
  // 1.2345 kg is 2.72157870 lb: both inputs have four decimals, the base quantity does not.
  expect((await f.ctx.db.rpc("receive_purchase_order", { ...input, p_lines: [{ ...input.p_lines[0], qty_counted: 1.2345 }] })).error?.message).toMatch(/too precise for the base unit/i);
  expect((await admin.from("receipts").select("id").eq("po_id", po.id)).data).toHaveLength(0);
  const posted = await f.ctx.db.rpc("receive_purchase_order", { ...input, p_lines: [{ ...input.p_lines[0], qty_counted: 10 }] });
  expect(posted.error).toBeNull();
  const receiptId = receiptResult.parse(posted.data).receipt_id;
  expect(sql(`select rl.qty_counted,rl.purchase_unit_cost_cents,m.qty from public.receipt_lines rl join public.material_movements m on m.id=rl.movement_id where rl.receipt_id='${receiptId}'`)[0].split("|").map(Number)).toEqual([10, 1000, 22.046]);
});
