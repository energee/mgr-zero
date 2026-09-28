import { describe, expect, it } from "vitest";
import { admin, channelId, ins, insertFixture, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { destinationStateCsv } from "../lib/mgr/destination-state-export";

describe("destination-state supporting facts (#626)", () => {
  it("includes every served state, exact physical returns and signed adjustments in reconciling facts", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const { skuId } = await seedCatalog(brewery.id, { bblPerUnit: 0.0645 });
    const location = await seedLocation(brewery.id);
    const channel = await channelId(brewery.id, "Wholesale");
    const base = { brewery_id: brewery.id, sku_id: skuId, location_id: location.id, bin_id: location.binId, created_by: ctx.userId };
    const saleId = crypto.randomUUID();
    insertFixture("inventory_movements", [
      { ...base, type: "opening_balance", qty: 100, created_at: "2025-08-01T12:00:00Z" },
      { ...base, id: saleId, type: "sale_removal", qty: -10, dest_state: "NY", sale_channel_id: channel, tax_treatment: "taxable", created_at: "2025-09-02T12:00:00Z" },
      { ...base, type: "return_in", qty: 2, source_movement_id: saleId, created_at: "2025-09-03T12:00:00Z" },
      { ...base, type: "sample", qty: -1, dest_state: "NJ", created_at: "2025-09-04T12:00:00Z" },
      { ...base, type: "adjustment", qty: 1, created_at: "2025-09-05T12:00:00Z" },
    ].map(row => ({ id: crypto.randomUUID(), ...row })));
    const result = await runCommand("generate_compliance_report", { jurisdiction: "TTB", periodStart: "2025-09-01", periodEnd: "2025-09-30" }, ctx) as {
      figures: { stateTransactions: { state: string; kind: string; volumeBbl: number; sourceId: string }[]; stateTotals: { state: string; volumeBbl: number }[] };
    };
    expect(result.figures.stateTransactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ state: "NY", kind: "sale_removal", volumeBbl: 0.645, sourceId: saleId }),
      expect.objectContaining({ state: "NY", kind: "return_in", volumeBbl: -0.129 }),
      expect.objectContaining({ state: "NJ", kind: "sample", volumeBbl: 0.0645 }),
      expect.objectContaining({ state: "Unassigned", kind: "adjustment", volumeBbl: -0.0645 }),
    ]));
    expect(result.figures.stateTotals).toEqual(expect.arrayContaining([
      expect.objectContaining({ state: "NY", volumeBbl: 0.516 }),
      expect.objectContaining({ state: "NJ", volumeBbl: 0.0645 }),
    ]));
    for (const total of result.figures.stateTotals) {
      expect(result.figures.stateTransactions.filter(row => row.state === total.state).reduce((sum, row) => sum + row.volumeBbl, 0)).toBeCloseTo(total.volumeBbl, 8);
    }
  });
});

it("counts invoice money once across shipment sources and keeps credits separate from physical returns", async () => {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "admin");
  const customer = await seedCustomer(brewery.id, { state: "NY" });
  const { skuId } = await seedCatalog(brewery.id, { bblPerUnit: 0.5 });
  const location = await seedLocation(brewery.id);
  const order = await ins("orders", { brewery_id: brewery.id, kind: "wholesale", status: "shipped", customer_id: customer.customerId, ship_to_id: customer.shipToId, sale_channel_id: customer.saleChannelId, from_location_id: location.id, created_by: ctx.userId });
  const shipment = await ins("shipments", { brewery_id: brewery.id, order_id: order.id, created_by: ctx.userId });
  const invoice = await ins("invoices", { brewery_id: brewery.id, shipment_id: shipment.id, customer_id: customer.customerId, issued_on: "2025-09-03" });
  const line = await ins("invoice_lines", { brewery_id: brewery.id, invoice_id: invoice.id, sku_id: skuId, kind: "sku", description: "Beer", qty: 8, unit_price_cents: 3600 });
  const credit = await ins("invoices", { brewery_id: brewery.id, kind: "credit_memo", customer_id: customer.customerId, issued_on: "2025-09-04" });
  await ins("invoice_lines", { brewery_id: brewery.id, invoice_id: credit.id, sku_id: skuId, kind: "sku", description: "Beer credit", qty: -1, unit_price_cents: 3600, credited_invoice_line_id: line.id });
  const base = { brewery_id: brewery.id, sku_id: skuId, location_id: location.id, bin_id: location.binId, created_by: ctx.userId };
  insertFixture("inventory_movements", [
    { ...base, type: "opening_balance", qty: 20, created_at: "2025-08-01T12:00:00Z" },
    ...[4, 6].map(qty => ({ ...base, type: "sale_removal", qty: -qty, ref: order.id, dest_state: "NY", sale_channel_id: customer.saleChannelId, tax_treatment: "taxable", created_at: "2025-09-02T12:00:00Z" })),
  ]);
  await admin.from("ship_tos").update({ state: "OH" }).eq("id", customer.shipToId).throwOnError();
  const result = await runCommand("generate_compliance_report", { jurisdiction: "TTB", periodStart: "2025-09-01", periodEnd: "2025-09-30" }, ctx) as import("../lib/commands/compliance").Report;
  expect(result.figures.stateTotals).toEqual([expect.objectContaining({ state: "NY", volumeBbl: 5, invoicedCents: 28800, creditedCents: 3600, salesCents: 25200 })]);
  expect(result.figures.stateTransactions?.filter(row => row.kind === "invoice")).toHaveLength(1);
  expect(result.figures.stateTransactions?.filter(row => row.kind === "return_in")).toHaveLength(0);
  const period = { jurisdiction: "TTB", periodStart: "2025-09-01", periodEnd: "2025-09-30" };
  await runCommand("file_compliance_report", period, ctx);
  await admin.from("invoices").update({ qbo_remote_state: "voided" }).eq("id", invoice.id).throwOnError();
  const current = await runCommand("generate_compliance_report", period, ctx) as import("../lib/commands/compliance").Report;
  expect(current.figures.stateTotals?.[0].invoicedCents).toBe(0);
  const saved = await runCommand("list_compliance_reports", period, ctx) as { filings: import("../lib/commands/compliance").Filing[] };
  expect(saved.filings[0].figures.stateTransactions).toEqual(result.figures.stateTransactions);
  expect(saved.filings[0].figures.stateTotals).toEqual(result.figures.stateTotals);
  const warehouse = await makeStaffCtx(brewery.id, "warehouse");
  await expect(runCommand("generate_compliance_report", period, warehouse)).rejects.toMatchObject({ status: 403 });
  const other = await makeBrewery();
  const outsider = await makeStaffCtx(other.id, "admin");
  const otherReport = await runCommand("generate_compliance_report", period, outsider) as import("../lib/commands/compliance").Report;
  expect(otherReport.figures.stateTransactions).toEqual([]);

});

it("reports a later-period physical return and compensation with their current-period signs", async () => {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "admin");
  const { skuId } = await seedCatalog(brewery.id, { bblPerUnit: 0.0645 });
  const location = await seedLocation(brewery.id);
  const channel = await channelId(brewery.id, "Wholesale");
  const base = { brewery_id: brewery.id, sku_id: skuId, location_id: location.id, bin_id: location.binId, created_by: ctx.userId };
  const shipmentId = crypto.randomUUID();
  const adjustmentId = crypto.randomUUID();
  insertFixture("inventory_movements", [
    { ...base, type: "opening_balance", qty: 20, created_at: "2025-08-01T12:00:00Z" },
    { ...base, id: shipmentId, type: "sale_removal", qty: -4, dest_state: "NY", sale_channel_id: channel, tax_treatment: "taxable", created_at: "2025-08-02T12:00:00Z" },
    { ...base, id: adjustmentId, type: "adjustment", qty: 2, created_at: "2025-08-03T12:00:00Z" },
    { ...base, type: "return_in", qty: 1, source_movement_id: shipmentId, created_at: "2025-09-02T12:00:00Z" },
    { ...base, type: "adjustment", qty: -2, compensates_id: adjustmentId, created_at: "2025-09-03T12:00:00Z" },
  ].map(row => ({ id: crypto.randomUUID(), ...row })));
  const result = await runCommand("generate_compliance_report", { jurisdiction: "TTB", periodStart: "2025-09-01", periodEnd: "2025-09-30" }, ctx) as import("../lib/commands/compliance").Report;
  expect(result.figures.stateTransactions).toHaveLength(2);
  expect(result.figures.stateTransactions).toEqual(expect.arrayContaining([
    expect.objectContaining({ state: "NY", kind: "return_in", originalSourceId: shipmentId, volumeBbl: -0.0645 }),
    expect.objectContaining({ state: "Unassigned", kind: "adjustment", originalSourceId: adjustmentId, volumeBbl: 0.129 }),
  ]));
  expect(result.figures.stateTotals).toEqual([
    expect.objectContaining({ state: "NY", outwardBbl: 0, returnedBbl: 0.0645, volumeBbl: -0.0645 }),
    expect.objectContaining({ state: "Unassigned", adjustmentBbl: 0.129, volumeBbl: 0.129 }),
  ]);
  const csv = destinationStateCsv("2025-09-01", "2025-09-30", result.figures.stateTransactions!);
  expect(csv).toContain(`"${shipmentId}","-0.0645","0"`);
  expect(csv).toContain(`"${adjustmentId}","0.129","0"`);
  expect(csv).not.toContain("2025-08-02");
});
