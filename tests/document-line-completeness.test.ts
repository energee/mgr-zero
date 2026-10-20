// tests/document-line-completeness.test.ts — get_order and get_invoice return
// every line of a document past PostgREST's max_rows (1000), not the first
// page (prerequisite named in #976 and #977). Database-backed.
import { describe, expect, it } from "vitest";
import { runCommand } from "@/lib/commands/registry";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, seedLocation } from "./helpers";
import "@/lib/commands/all";

const LINES = 1_001;
const fixtureId = (prefix: string, index: number) =>
  `${prefix}-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;

describe("document line reads past the row cap", () => {
  it("get_order and get_invoice return every line", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const catalog = await seedCatalog(brewery.id);
    const location = await seedLocation(brewery.id);
    const customer = await seedCustomer(brewery.id);

    // order_lines is unique per (order, sku), so each line needs its own SKU.
    const brandPrefix = crypto.randomUUID().slice(0, 8);
    const skuPrefix = crypto.randomUUID().slice(0, 8);
    const brands = Array.from({ length: LINES }, (_, index) => ({ id: fixtureId(brandPrefix, index + 1), brewery_id: brewery.id, name: `Line brand ${index}` }));
    expect((await admin.from("brands").insert(brands)).error).toBeNull();
    const skus = brands.map((brand, index) => ({ id: fixtureId(skuPrefix, index + 1), brewery_id: brewery.id, brand_id: brand.id, format_id: catalog.formatId, name: `Line SKU ${index}` }));
    expect((await admin.from("skus").insert(skus)).error).toBeNull();

    const order = await admin.from("orders").insert({
      brewery_id: brewery.id, kind: "wholesale", customer_id: customer.customerId, ship_to_id: customer.shipToId,
      sale_channel_id: customer.saleChannelId, from_location_id: location.id, created_by: ctx.userId,
    }).select("id").single();
    expect(order.error).toBeNull();
    expect((await admin.from("order_lines").insert(skus.map(sku => ({
      brewery_id: brewery.id, order_id: order.data!.id, sku_id: sku.id, qty_ordered: 1, unit_price_cents: 100,
    })))).error).toBeNull();

    const invoice = await admin.from("invoices").insert({ brewery_id: brewery.id, customer_id: customer.customerId, kind: "invoice" }).select("id").single();
    expect(invoice.error).toBeNull();
    expect((await admin.from("invoice_lines").insert(skus.map(sku => ({
      brewery_id: brewery.id, invoice_id: invoice.data!.id, sku_id: sku.id, description: "Line", qty: 1, unit_price_cents: 100,
    })))).error).toBeNull();

    const [gotOrder, gotInvoice] = await Promise.all([
      runCommand("get_order", { orderId: order.data!.id }, ctx) as Promise<{ lines: unknown[] }>,
      runCommand("get_invoice", { invoiceId: invoice.data!.id }, ctx) as Promise<{ lines: unknown[] }>,
    ]);
    expect({ orderLines: gotOrder.lines.length, invoiceLines: gotInvoice.lines.length })
      .toEqual({ orderLines: LINES, invoiceLines: LINES });
  }, 30_000);
});
