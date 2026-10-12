// tests/purchase-order-closure.test.ts — closing a PO releases only its unreceived remainder.
import { describe, expect, it } from "vitest";
import { makeBrewery, makeStaffCtx, seedLocation, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

async function purchaseOrder() {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "warehouse");
  const location = await seedLocation(brewery.id);
  const vendor = await runCommand("upsert_vendor", { name: "Closure supplier" }, ctx) as { id: string };
  const material = await runCommand("upsert_material", {
    name: "Closure malt", category: "malt", baseUom: "lb", purchaseUom: "lb", purchaseUomFactor: 1,
  }, ctx) as { id: string };
  const po = await runCommand("create_purchase_order", {
    vendorId: vendor.id, lines: [{ materialId: material.id, qtyOrdered: 20, unitCostCents: 100 }],
  }, ctx) as { id: string };
  const detail = await runCommand("get_purchase_order", { poId: po.id }, ctx) as { lines: { id: string }[] };
  const receiveInput = {
    poId: po.id, locationId: location.id, binId: location.binId,
    lines: [{ poLineId: detail.lines[0].id, qtyCounted: 15 }],
  };
  return { brewery, ctx, material, po, lineId: detail.lines[0].id, receiveInput };
}

describe("purchase order closure", () => {
  it.each(["draft", "sent"])("cancels a %s order once, records the reason and actor, and removes its remainder", async state => {
    const f = await purchaseOrder();
    if (state === "sent") await runCommand("send_purchase_order", { poId: f.po.id, sentVia: "external" }, f.ctx);
    const requestId = crypto.randomUUID();
    const input = { poId: f.po.id, reason: "Vendor cannot supply this order" };
    const result = await runCommand("cancel_purchase_order", input, f.ctx, { requestId, correlationId: requestId });
    expect(await runCommand("cancel_purchase_order", input, f.ctx, { requestId, correlationId: requestId })).toEqual(result);
    expect(sql(`select status,closed_by,close_reason,closed_at is not null from public.purchase_orders where id='${f.po.id}'`))
      .toEqual([`cancelled|${f.ctx.userId}|Vendor cannot supply this order|t`]);
    expect(sql(`select qty_received,qty_open from public.po_open_balances where po_line_id='${f.lineId}'`)[0].split("|").map(Number)).toEqual([0, 0]);
    expect(await runCommand("list_purchase_orders", {}, f.ctx)).toEqual([]);
    await expect(runCommand("send_purchase_order", { poId: f.po.id, sentVia: "external" }, f.ctx)).rejects.toThrow(/cancelled|closed/i);
    await expect(runCommand("receive_purchase_order", f.receiveInput, f.ctx)).rejects.toThrow(/cancelled|closed/i);
    await expect(runCommand("cancel_purchase_order", { ...input, reason: "Different reason" }, f.ctx, { requestId, correlationId: requestId }))
      .rejects.toThrow(/request|conflict|different/i);
  });

  it("closes a partially received order short without discarding stock, and receipt correction cannot reopen it", async () => {
    const f = await purchaseOrder();
    await runCommand("send_purchase_order", { poId: f.po.id, sentVia: "external" }, f.ctx);
    const receipt = await runCommand("receive_purchase_order", f.receiveInput, f.ctx) as { receipt_id: string };
    await expect(runCommand("cancel_purchase_order", { poId: f.po.id, reason: "Cancel remainder" }, f.ctx)).rejects.toThrow(/receipt|partially/i);
    const requestId = crypto.randomUUID();
    const input = { poId: f.po.id, reason: "Vendor cancelled the last five pounds" };
    const result = await runCommand("close_purchase_order_short", input, f.ctx, { requestId, correlationId: requestId });
    expect(await runCommand("close_purchase_order_short", input, f.ctx, { requestId, correlationId: requestId })).toEqual(result);
    expect(sql(`select status,closed_by,close_reason,closed_at is not null from public.purchase_orders where id='${f.po.id}'`))
      .toEqual([`received|${f.ctx.userId}|Vendor cancelled the last five pounds|t`]);
    expect(sql(`select qty_received,qty_open from public.po_open_balances where po_line_id='${f.lineId}'`)[0].split("|").map(Number)).toEqual([15, 0]);
    expect(sql(`select sum(qty) from public.material_movements where material_id='${f.material.id}'`)).toEqual(["15.0000"]);
    expect(await runCommand("list_purchase_orders", {}, f.ctx)).toEqual([]);
    await expect(runCommand("receive_purchase_order", f.receiveInput, f.ctx)).rejects.toThrow(/received|closed/i);
    await runCommand("correct_purchase_receipt", {
      receiptId: receipt.receipt_id, reason: "Only fourteen pounds arrived",
      lines: [{ poLineId: f.lineId, qtyCounted: 14 }],
    }, f.ctx);
    expect(sql(`select qty_expected,qty_counted,variance from public.receipt_lines where receipt_id in (select id from public.receipts where corrects_receipt_id='${receipt.receipt_id}')`)[0].split("|").map(Number)).toEqual([20, 14, -6]);
    expect(sql(`select status from public.purchase_orders where id='${f.po.id}'`)).toEqual(["received"]);
    expect(sql(`select qty_received,qty_open from public.po_open_balances where po_line_id='${f.lineId}'`)[0].split("|").map(Number)).toEqual([14, 0]);
    expect(sql(`select sum(qty) from public.material_movements where material_id='${f.material.id}'`)).toEqual(["14.0000"]);
  });

  it("rejects an empty closure reason, the wrong role, and a foreign purchase order", async () => {
    const f = await purchaseOrder();
    await expect(runCommand("cancel_purchase_order", { poId: f.po.id, reason: " " }, f.ctx)).rejects.toThrow();
    const brewer = await makeStaffCtx(f.brewery.id, "brewer");
    await expect(runCommand("cancel_purchase_order", { poId: f.po.id, reason: "Wrong role" }, brewer)).rejects.toThrow(/role|permission|forbidden/i);
    const other = await makeBrewery();
    const foreign = await makeStaffCtx(other.id, "warehouse");
    await expect(runCommand("cancel_purchase_order", { poId: f.po.id, reason: "Wrong brewery" }, foreign)).rejects.toThrow(/not found|brewery|tenant/i);
    expect(sql(`select status from public.purchase_orders where id='${f.po.id}'`)).toEqual(["draft"]);
  });
});
