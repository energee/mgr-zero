// tests/export-destination.test.ts — an export removal names its destination
// country (docs/plans/lolev-orders.md, task 4). Shipping to a ship-to outside
// the US writes the sale removal with dest_country and no dest_state, and only
// an export order may do that. The compliance report counts it under export
// and gives it no Unassigned destination-state fact, before or after a return.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, channelId, ins, insertFixture, makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import type { Report } from "@/lib/commands/compliance";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let breweryId: string, owner: Ctx;
let wh: Awaited<ReturnType<typeof seedLocation>>;
let skuId: string, exportChannel: string, wholesaleChannel: string;
const PERIOD = { jurisdiction: "TTB", periodStart: "2026-10-01", periodEnd: "2026-10-31" };

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  owner = await makeStaffCtx(breweryId, "admin");
  wh = await seedLocation(breweryId);
  const cat = await seedCatalog(breweryId, { sku: "IPA case", bblPerUnit: 0.0645 });
  skuId = cat.skuId;
  exportChannel = await channelId(breweryId, "Export");
  wholesaleChannel = await channelId(breweryId, "Wholesale");
  for (const saleChannelId of [exportChannel, wholesaleChannel])
    await priceSku(breweryId, { saleChannelId, brandId: cat.brandId, formatId: cat.formatId, cents: 4000 });
  await ins("inventory_movements", { brewery_id: breweryId, sku_id: skuId, location_id: wh.id, bin_id: wh.binId, qty: 100, type: "opening_balance", created_by: owner.userId });
});

/** A customer on a channel with one ship-to in a country (and, in the US, a state). */
async function customer(channel: string, country: string, state: string | null) {
  const c = await ins("customers", { brewery_id: breweryId, name: `C ${crypto.randomUUID().slice(0, 6)}`, type: "retailer", country, state, sale_channel_id: channel });
  const s = await ins("ship_tos", { brewery_id: breweryId, customer_id: c.id, label: "Main", country, state });
  return { customerId: c.id, shipToId: s.id };
}

/** Create, submit, confirm and pick a two-case order; returns the order and its line. */
async function picked(c: { customerId: string; shipToId: string }) {
  const orderId = (await runCommand("create_order", { kind: "wholesale", ...c, fromLocationId: wh.id, lines: [{ skuId, qty: 2 }] }, owner) as { order_id: string }).order_id;
  await runCommand("submit_order", { orderId }, owner);
  await runCommand("confirm_order", { orderId }, owner);
  const lineId = (await admin.from("order_lines").select("id").eq("order_id", orderId).single().throwOnError()).data!.id;
  await runCommand("record_pick", { orderId, picks: [{ lineId, qty: 2 }] }, owner);
  return { orderId, lineId };
}

const ship = ({ orderId, lineId }: { orderId: string; lineId: string }) =>
  runCommand("ship_order", { orderId, ship: [{ lineId, qty: 2 }], invoiceTiming: "now" }, owner) as Promise<{ invoice_id: string }>;

const removals = async (orderId: string) =>
  (await admin.from("inventory_movements").select("id, dest_state, dest_country, tax_treatment").eq("ref", orderId).eq("type", "sale_removal").throwOnError()).data!;

const report = () => runCommand("generate_compliance_report", PERIOD, owner) as Promise<Report>;

describe("export destination country", () => {
  let jp: { orderId: string; invoiceId: string; removalId: string };

  beforeAll(async () => {
    const order = await picked(await customer(exportChannel, "JP", null));
    const { invoice_id } = await ship(order);
    jp = { orderId: order.orderId, invoiceId: invoice_id, removalId: (await removals(order.orderId))[0].id };
  });

  it("an export order to a JP ship-to ships with dest_country JP and no state", async () => {
    expect(await removals(jp.orderId)).toEqual([expect.objectContaining({ dest_country: "JP", dest_state: null, tax_treatment: "export" })]);
  });

  it("a taxable (Wholesale) order to a JP ship-to is refused", async () => {
    const order = await picked(await customer(wholesaleChannel, "JP", null));
    await expect(ship(order)).rejects.toThrow(/only an export order can ship outside the US/);
    expect(await removals(order.orderId)).toEqual([]);
  });

  it("a US export (ship-to PA) still ships with dest_state PA and no country", async () => {
    const order = await picked(await customer(exportChannel, "US", "PA"));
    await ship(order);
    expect(await removals(order.orderId)).toEqual([expect.objectContaining({ dest_state: "PA", dest_country: null, tax_treatment: "export" })]);
  });

  it("the compliance removals total counts the JP removal under export", async () => {
    const r = await report();
    // JP (2 cases) and the US export to PA (2 cases): 4 × 0.0645 bbl
    expect(r.figures.removals.export).toBe(0.26);
  });

  it("the JP shipment's movement and invoice line add no Unassigned fact or warning", async () => {
    const r = await report();
    const facts = r.figures.stateTransactions!;
    expect(facts.filter(f => f.state === "Unassigned")).toEqual([]);
    expect(facts.map(f => f.sourceId)).not.toContain(jp.removalId);
    expect(r.warnings.join(" ")).not.toMatch(/Unassigned/);
  });

  it("a return of part of the JP shipment adds no Unassigned fact either", async () => {
    const line = (await admin.from("invoice_lines").select("id").eq("invoice_id", jp.invoiceId).eq("kind", "sku").single().throwOnError()).data!;
    await runCommand("return_shipment", { invoiceId: jp.invoiceId, locationId: wh.id, reason: "unsold", lines: [{ invoiceLineId: line.id, qty: 1 }] }, owner);
    const returned = (await admin.from("inventory_movements").select("id").eq("source_movement_id", jp.removalId).eq("type", "return_in").throwOnError()).data!;
    expect(returned).toHaveLength(1);
    const r = await report();
    expect(r.figures.stateTransactions!.filter(f => f.state === "Unassigned")).toEqual([]);
    expect(r.warnings.join(" ")).not.toMatch(/Unassigned/);
  });

  it("the ledger refuses a taxable sale removal that names a country", () => {
    const row = { brewery_id: breweryId, sku_id: skuId, location_id: wh.id, bin_id: wh.binId, qty: -1, type: "sale_removal", created_by: owner.userId };
    expect(() => insertFixture("inventory_movements", { ...row, sale_channel_id: wholesaleChannel, tax_treatment: "taxable", dest_country: "JP" })).toThrow(/23514/);
    expect(() => insertFixture("inventory_movements", { ...row, sale_channel_id: exportChannel, tax_treatment: "export", dest_country: "JP", dest_state: "PA" })).toThrow(/23514/);
    expect(() => insertFixture("inventory_movements", { ...row, sale_channel_id: exportChannel, tax_treatment: "export", dest_country: "JP" })).not.toThrow();
  });
});
