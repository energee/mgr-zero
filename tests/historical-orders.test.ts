// tests/historical-orders.test.ts — an order picked up before the books opened
// is recorded as shipped, picked up and paid, with no stock, allocations,
// deposits, fees or keg events (docs/plans/lolev-orders.md task 7). Its invoice
// is `not_synced`: never sent to QuickBooks, and it cannot be returned.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, seedLocation, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
type Recorded = { order_id: string; order_no: number; invoice_id: string };
let breweryId: string, owner: Ctx, sales: Ctx;
let customerId: string, shipToId: string, otherShipToId: string, skuId: string, keg: string, whId: string;

const once = (requestId?: string) => (requestId ? { requestId, correlationId: requestId } : undefined);
const record = (input: Record<string, unknown> = {}, ctx = owner, requestId?: string) =>
  runCommand("record_historical_order", {
    customerId, shipToId, pickedUpOn: "2025-08-14", lines: [{ skuId, qty: 3, unitPriceCents: 4500 }, { skuId: keg, qty: 2, unitPriceCents: 16000 }], ...input,
  }, ctx, once(requestId)) as Promise<Recorded>;
const count = (table: string, where: string) => Number(sql(`select count(*) from ${table} where ${where}`, true)[0]);

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  owner = await makeStaffCtx(breweryId, "admin");
  sales = await makeStaffCtx(breweryId, "sales");
  whId = (await seedLocation(breweryId)).id;
  ({ skuId } = await seedCatalog(breweryId, { product: "Old IPA", sku: "Old IPA case" }));
  ({ skuId: keg } = await seedCatalog(breweryId, { product: "Old Pils", sku: "Old Pils half", packageType: "keg", bblPerUnit: 0.5 }));
  ({ customerId, shipToId } = await seedCustomer(breweryId, { name: "Cedar Distribution" }));
  ({ shipToId: otherShipToId } = await seedCustomer(breweryId, { name: "River" }));
  await runCommand("set_one_way_keg_fee", { feeCents: 1000 }, owner);
  await runCommand("set_books_opened_on", { booksOpenedOn: "2026-10-01" }, owner);
});

describe("record_historical_order", () => {
  it("writes a shipped pickup order, its lines, a shipment and a paid not_synced invoice, with no stock or deposits", async () => {
    const r = await record({ note: "Example Brewing block 12" });
    const order = (await admin.from("orders").select("kind, status, pickup, from_location_id, shipped_at, note, order_no")
      .eq("id", r.order_id).single().throwOnError()).data!;
    expect(order).toMatchObject({ kind: "wholesale", status: "shipped", pickup: true, from_location_id: whId, note: "Example Brewing block 12", order_no: r.order_no });
    expect(order.shipped_at).not.toBeNull();
    const lines = (await admin.from("order_lines").select("sku_id, qty_ordered, qty_picked, qty_shipped, unit_price_cents, one_way_fee_cents")
      .eq("order_id", r.order_id).order("unit_price_cents").throwOnError()).data!;
    expect(lines).toEqual([
      { sku_id: skuId, qty_ordered: 3, qty_picked: 3, qty_shipped: 3, unit_price_cents: 4500, one_way_fee_cents: null },
      { sku_id: keg, qty_ordered: 2, qty_picked: 2, qty_shipped: 2, unit_price_cents: 16000, one_way_fee_cents: null },
    ]);
    const shipment = (await admin.from("shipments").select("id, invoice_timing, shipped_at").eq("order_id", r.order_id).single().throwOnError()).data!;
    expect(shipment).toMatchObject({ invoice_timing: "now", shipped_at: order.shipped_at });
    const invoice = (await admin.from("invoices").select("kind, shipment_id, issued_on, due_on, paid_at, qbo_sync_status")
      .eq("id", r.invoice_id).single().throwOnError()).data!;
    expect(invoice).toMatchObject({ kind: "invoice", shipment_id: shipment.id, issued_on: "2025-08-14", due_on: "2025-08-14", qbo_sync_status: "not_synced" });
    expect(invoice.paid_at).not.toBeNull();
    const invoiceLines = (await admin.from("invoice_lines").select("kind, sku_id, qty, unit_price_cents, description")
      .eq("invoice_id", r.invoice_id).order("unit_price_cents").throwOnError()).data!;
    expect(invoiceLines).toEqual([
      { kind: "sku", sku_id: skuId, qty: 3, unit_price_cents: 4500, description: "Old IPA case" },
      { kind: "sku", sku_id: keg, qty: 2, unit_price_cents: 16000, description: "Old Pils half" },
    ]);
    expect(count("inventory_movements", `brewery_id = '${breweryId}'`)).toBe(0);
    expect(count("allocations", `brewery_id = '${breweryId}'`)).toBe(0);
    expect(count("order_deposit_lines", `order_id = '${r.order_id}'`)).toBe(0);
    expect(count("keg_events", `brewery_id = '${breweryId}'`)).toBe(0);
  });

  it("queues no buyer email, chat notification, or Today item", async () => {
    const r = await record();
    expect(count("private.order_email_deliveries", `order_id = '${r.order_id}'`)).toBe(0);
    expect(count("notification_occurrences", `subject_id = '${r.order_id}' or subject_id = '${r.invoice_id}'`)).toBe(0);
    expect(count(`public.scan_chat_today_candidates('${breweryId}', now())`, `subject_id in ('${r.order_id}', '${r.invoice_id}')`)).toBe(0);
  });

  it("start_qbo_push refuses its invoice", async () => {
    const r = await record();
    await admin.from("qbo_connections").insert({ brewery_id: breweryId, realm_id: `realm-${crypto.randomUUID()}`, realm_label: "Books", state: "connected" }).throwOnError();
    const push = await sales.db.rpc("start_qbo_push", { p_brewery: breweryId, p_invoice: r.invoice_id, p_new_attempt_reason: null, p_request_id: crypto.randomUUID() });
    expect(push.error?.message).toMatch(/historical invoices are not sent to QuickBooks/);
    // A new QuickBooks company resets pushed invoices to pending; history stays out.
    await admin.from("qbo_connections").update({ realm_id: `realm-${crypto.randomUUID()}` }).eq("brewery_id", breweryId).throwOnError();
    const after = (await admin.from("invoices").select("qbo_sync_status").eq("id", r.invoice_id).single().throwOnError()).data!;
    expect(after.qbo_sync_status).toBe("not_synced");
  });

  it("keeps its shipment off the routes screen's unrouted list", async () => {
    const r = await record();
    const shipment = (await admin.from("shipments").select("id").eq("order_id", r.order_id).single().throwOnError()).data!;
    const routes = await runCommand("list_routes", {}, owner) as { unassigned: { id: string }[] };
    expect(routes.unassigned.map((d) => d.id)).not.toContain(shipment.id);
  });

  it("refuses return_shipment and create_credit_memo on its invoice", async () => {
    const r = await record();
    const line = (await admin.from("invoice_lines").select("id").eq("invoice_id", r.invoice_id).eq("sku_id", skuId).single().throwOnError()).data!;
    const input = { invoiceId: r.invoice_id, locationId: whId, lines: [{ invoiceLineId: line.id, qty: 1 }] };
    await expect(runCommand("return_shipment", { ...input, reason: "unsold" }, owner)).rejects.toThrow(/a historical order cannot be returned/);
    await expect(runCommand("create_credit_memo", { ...input, reason: "goodwill" }, owner)).rejects.toThrow(/a historical order cannot be returned/);
  });

  it("refuses dates on or after the books opened, a foreign ship-to or SKU, bad lines, and a non-admin", async () => {
    const otherBrewery = (await makeBrewery()).id;
    const { skuId: foreignSku } = await seedCatalog(otherBrewery, { product: "Elsewhere" });
    await expect(record({ pickedUpOn: "2026-10-01" })).rejects.toThrow(/before the books opened \(2026-10-01\)/);
    await expect(record({ shipToId: otherShipToId })).rejects.toThrow(/ship-to/);
    await expect(record({ lines: [{ skuId: foreignSku, qty: 1, unitPriceCents: 100 }] })).rejects.toThrow(/SKU/);
    await expect(record({ lines: [{ skuId, qty: 0, unitPriceCents: 100 }] })).rejects.toThrow();
    await expect(record({ lines: [{ skuId, qty: 1, unitPriceCents: 1 }, { skuId, qty: 2, unitPriceCents: 1 }] })).rejects.toThrow(/once/);
    await expect(record({}, sales)).rejects.toThrow(/permission denied|not allowed|role/);
    // The RPC enforces what zod also checks, for a caller that skips the command.
    const rpc = (lines: unknown) => owner.db.rpc("record_historical_order", { p_brewery: breweryId, p_customer: customerId, p_ship_to: shipToId,
      p_picked_up_on: "2025-08-14", p_lines: lines as never, p_note: null as never, p_request_id: crypto.randomUUID() });
    expect((await rpc([{ sku_id: skuId, qty: -1, unit_price_cents: 1 }])).error?.message).toMatch(/positive/);
    expect((await rpc([{ sku_id: skuId, qty: 1, unit_price_cents: -1 }])).error?.message).toMatch(/price/);
    expect((await rpc([])).error?.message).toMatch(/at least one line/);
  });

  it("refuses history before a books opened date is set", async () => {
    const fresh = (await makeBrewery()).id;
    const freshOwner = await makeStaffCtx(fresh, "admin");
    await seedLocation(fresh);
    const c = await seedCustomer(fresh);
    const { skuId: s } = await seedCatalog(fresh);
    await expect(runCommand("record_historical_order", { customerId: c.customerId, shipToId: c.shipToId, pickedUpOn: "2025-01-02",
      lines: [{ skuId: s, qty: 1, unitPriceCents: 100 }] }, freshOwner)).rejects.toThrow(/set the books opened date/);
  });

  it("replays the same request id without writing again", async () => {
    const requestId = crypto.randomUUID();
    const first = await record({}, owner, requestId);
    const orders = count("orders", `brewery_id = '${breweryId}'`), invoices = count("invoices", `brewery_id = '${breweryId}'`);
    expect(await record({}, owner, requestId)).toEqual(first);
    expect(count("orders", `brewery_id = '${breweryId}'`)).toBe(orders);
    expect(count("invoices", `brewery_id = '${breweryId}'`)).toBe(invoices);
  });
});
