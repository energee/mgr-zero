// tests/compliance-activity.test.ts — list_compliance_active_periods names the
// recent periods (every cadence) holding anything the compliance report reads,
// so the Compliance list can mark an ended, unfiled, empty period No activity
// (#1209). list_compliance_reports leaves that scan out: Settings and a period
// page read filings only (#1491).
import { beforeAll, describe, expect, it } from "vitest";
import { ins, insertFixture, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import { periodRange, recentPeriods } from "@/lib/compliance-period";
import "@/lib/commands/all";

let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let breweryId: string;
const active = () => runCommand("list_compliance_active_periods", {}, ctx) as Promise<string[]>;
const reports = () => runCommand("list_compliance_reports", {}, ctx) as Promise<Record<string, unknown> & { today: string }>;

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  ctx = await makeStaffCtx(breweryId);
});

describe("list_compliance_active_periods", () => {
  it("is empty for a brewery with no ledger rows", async () => {
    expect(await active()).toEqual([]);
  });

  it("is not part of list_compliance_reports", async () => {
    expect(await reports()).not.toHaveProperty("activePeriods");
  });

  it("names the month, quarter and year of a movement, and not the empty month before it", async () => {
    const { today } = await reports();
    const [, last, before] = recentPeriods(today, "month");
    const day = periodRange(last)!.periodStart;
    const { skuId } = await seedCatalog(breweryId, { packageType: "can", bblPerUnit: 0.5 });
    const loc = await seedLocation(breweryId);
    insertFixture("inventory_movements", {
      brewery_id: breweryId, sku_id: skuId, location_id: loc.id, bin_id: loc.binId,
      created_by: ctx.userId, qty: 4, type: "production_in", occurred_on: day,
    });
    const quarter = `${day.slice(0, 4)}-Q${Math.ceil(Number(day.slice(5, 7)) / 3)}`;
    const activePeriods = await active();
    expect(activePeriods).toEqual(expect.arrayContaining([last, quarter, day.slice(0, 4)]));
    expect(activePeriods).not.toContain(before);
  });

  // #1607: the scan reads invoice months itself, keeping the export exclusion.
  it("names a month holding only an invoice line, and not one holding only an export's invoice", async () => {
    const brewery = await makeBrewery();
    const staff = await makeStaffCtx(brewery.id);
    const { today } = await runCommand("list_compliance_reports", {}, staff) as { today: string };
    const [current, last, before] = recentPeriods(today, "month");
    const day = (key: string) => periodRange(key)!.periodStart;
    const customer = await seedCustomer(brewery.id, { state: "NY" });
    const { skuId } = await seedCatalog(brewery.id, { bblPerUnit: 0.5 });
    const loc = await seedLocation(brewery.id);
    const invoiceLine = async (issuedOn: string, shipmentId: string | null) => {
      const invoice = await ins("invoices", { brewery_id: brewery.id, shipment_id: shipmentId, customer_id: customer.customerId, issued_on: issuedOn });
      await ins("invoice_lines", { brewery_id: brewery.id, invoice_id: invoice.id, sku_id: skuId, kind: "sku", description: "Beer", qty: 1, unit_price_cents: 3600 });
    };
    // last month: an invoice line and no ledger row
    await invoiceLine(day(last), null);
    // the month before: only the invoice of a shipment exported to a country, removed this month
    const order = await ins("orders", { brewery_id: brewery.id, kind: "wholesale", status: "shipped", customer_id: customer.customerId, ship_to_id: customer.shipToId, sale_channel_id: customer.saleChannelId, from_location_id: loc.id, created_by: staff.userId });
    const shipment = await ins("shipments", { brewery_id: brewery.id, order_id: order.id, created_by: staff.userId });
    const base = { brewery_id: brewery.id, sku_id: skuId, location_id: loc.id, bin_id: loc.binId, created_by: staff.userId, occurred_on: day(current) };
    insertFixture("inventory_movements", [
      { ...base, type: "opening_balance", qty: 2 },
      { ...base, type: "sale_removal", qty: -1, ref: order.id, dest_country: "CA", sale_channel_id: customer.saleChannelId, tax_treatment: "export" },
    ]);
    await invoiceLine(day(before), shipment.id);
    const activePeriods = await runCommand("list_compliance_active_periods", {}, staff) as string[];
    expect(activePeriods).toEqual(expect.arrayContaining([current, last]));
    expect(activePeriods).not.toContain(before);
  });
});
