import type { Database } from "@/lib/supabase/database";
import { assert } from "vitest";
// tests/orders-fulfillment.test.ts — pick → ship → movements + invoice; credit memo; replenishment; needs_restock.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, ins, makeBrewery, makeStaff, asUser, seedCatalog, seedLocation, seedCustomer, channelId, priceSku } from "./helpers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let b: { id: string }, staffDb: SupabaseClient<Database>, staffId: string, staffEmail: string;
let customerId: string, shipToId: string, whId: string, whBinId: string, tapId: string, skuId: string, saleChannelId: string;

beforeAll(async () => {
  // identical seed to tests/orders-lifecycle.test.ts, plus a taproom location:
  b = await makeBrewery();
  const staff = await makeStaff(b.id); staffId = staff.id; staffEmail = staff.email; staffDb = await asUser(staff.email);
  ({ id: whId, binId: whBinId } = await seedLocation(b.id));
  tapId = (await seedLocation(b.id, { name: "Taproom", uses: ["taproom"] })).id;
  const cat = await seedCatalog(b.id, { sku: "IPA 1/2bbl", packageType: "keg", bblPerUnit: 0.5 });
  skuId = cat.skuId;
  const cust = await seedCustomer(b.id);
  ({ customerId, shipToId, saleChannelId } = cust);
  await priceSku(b.id, { saleChannelId, brandId: cat.brandId, formatId: cat.formatId, cents: 12000 });
  await ins("inventory_movements", { brewery_id: b.id, sku_id: skuId, location_id: whId, bin_id: whBinId, qty: 100, type: "opening_balance", created_by: staffId });
});

async function confirmedOrder(qty = 10) {
  const { data, error } = await staffDb.rpc("create_order", {
    p_brewery: b.id, p_kind: "wholesale", p_customer: customerId, p_ship_to: shipToId,
    p_from_location: whId, p_to_location: null, p_requested: null, p_po: null, p_note: null,
    p_lines: [{ sku_id: skuId, qty }],
    p_request_id: crypto.randomUUID(),
  });
  expect(error).toBeNull();
  const id = (data as { order_id: string }).order_id;
  await staffDb.rpc("submit_order", { p_order: id, p_request_id: crypto.randomUUID() });
  await staffDb.rpc("confirm_order", { p_order: id, p_request_id: crypto.randomUUID() });
  return id;
}
async function lineOf(orderId: string) {
  const { data } = await admin.from("order_lines").select().eq("order_id", orderId).single();
  return data!;
}

describe("pick and ship", () => {
  it("connects ordered 10 → picked 6 → shipped 4 → put back 2 with six cancelled and demand released", async () => {
    const id = await confirmedOrder(10);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", {
      p_order: id,
      p_picks: [{ line_id: line.id, qty_picked: 6 }],
      p_request_id: crypto.randomUUID(),
    });
    const shipped = await staffDb.rpc("ship_order", {
      p_order: id,
      p_ship: [{ line_id: line.id, qty_shipped: 4, short_reason: "two kegs dented" }],
      p_carrier: "self",
      p_tracking: null,
      p_request_id: crypto.randomUUID(),
    });
    expect(shipped.error).toBeNull();

    const invoiceId = (shipped.data as { invoice_id: string }).invoice_id;
    const invoiceDates = (await admin.from("invoices").select("issued_on,due_on").eq("id", invoiceId).single()).data!;
    const expectedDue = new Date(`${invoiceDates.issued_on}T12:00:00Z`);
    expectedDue.setUTCDate(expectedDue.getUTCDate() + 30);
    expect(invoiceDates.due_on).toBe(expectedDue.toISOString().slice(0, 10));
    expect(await lineOf(id)).toMatchObject({ qty_ordered: 10, qty_picked: 6, qty_shipped: 4 });
    expect((await admin.from("orders").select("status,needs_restock").eq("id", id).single()).data)
      .toEqual({ status: "shipped", needs_restock: true });
    expect((await admin.from("invoice_lines").select("qty,amount_cents").eq("invoice_id", invoiceId)).data)
      .toEqual([{ qty: 4, amount_cents: 48000 }]);
    expect((await admin.from("inventory_movements").select("qty").eq("ref", id)).data)
      .toEqual([{ qty: -4 }]);
    expect((await admin.from("allocations").select("qty,status").eq("ref", line.id).single()).data)
      .toEqual({ qty: 10, status: "fulfilled" });

    await staffDb.rpc("confirm_restock", { p_order: id, p_request_id: crypto.randomUUID() });
    expect((await admin.from("orders").select("needs_restock").eq("id", id).single()).data)
      .toEqual({ needs_restock: false });
    expect((await admin.from("order_events").select("event").eq("order_id", id).order("created_at")).data?.map((event) => event.event))
      .toEqual(["created", "submitted", "confirmed", "picked", "shipped", "restocked"]);
  });

  it("reorders only refused delivery quantities with the original PO and note as an editable draft", async () => {
    const brewery = await makeBrewery();
    const staff = await makeStaff(brewery.id);
    const db = await asUser(staff.email);
    const source = await seedLocation(brewery.id);
    const catalog = await seedCatalog(brewery.id, { sku: "Refused reorder keg", packageType: "keg", bblPerUnit: 0.5 });
    const customer = await seedCustomer(brewery.id);
    await priceSku(brewery.id, { saleChannelId: customer.saleChannelId, brandId: catalog.brandId, formatId: catalog.formatId, cents: 12000 });
    await ins("inventory_movements", { brewery_id: brewery.id, sku_id: catalog.skuId, location_id: source.id, bin_id: source.binId, qty: 4, type: "opening_balance", created_by: staff.id });
    const created = await db.rpc("create_order", {
      p_brewery: brewery.id, p_kind: "wholesale", p_customer: customer.customerId, p_ship_to: customer.shipToId,
      p_from_location: source.id, p_to_location: null, p_requested: null, p_po: "BUYER-123", p_note: "Deliver after lunch",
      p_lines: [{ sku_id: catalog.skuId, qty: 4 }], p_request_id: crypto.randomUUID(),
    });
    expect(created.error).toBeNull();
    const original = created.data as { order_id: string };
    expect((await db.rpc("submit_order", { p_order: original.order_id, p_request_id: crypto.randomUUID() })).error).toBeNull();
    expect((await db.rpc("confirm_order", { p_order: original.order_id, p_request_id: crypto.randomUUID() })).error).toBeNull();
    const line = await lineOf(original.order_id);
    expect((await db.rpc("record_pick", { p_order: original.order_id, p_picks: [{ line_id: line.id, qty_picked: 4 }], p_request_id: crypto.randomUUID() })).error).toBeNull();
    expect((await db.rpc("ship_order", { p_order: original.order_id, p_ship: [{ line_id: line.id, qty_shipped: 4 }], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() })).error).toBeNull();
    expect((await admin.from("order_lines").update({ qty_refused: 2 }).eq("id", line.id)).error).toBeNull();
    const requestId = crypto.randomUUID();
    const reordered = await db.rpc("reorder_refused_delivery", { p_order: original.order_id, p_request_id: requestId });
    expect(reordered.error).toBeNull();
    expect(await db.rpc("reorder_refused_delivery", { p_order: original.order_id, p_request_id: requestId })).toMatchObject({ data: reordered.data, error: null });
    const result = reordered.data as { order_id: string };
    const draft = (await admin.from("orders").select("order_no,status,po_number,note,customer_id,ship_to_id,from_location_id,requested_ship_date").eq("id", result.order_id).single()).data!;
    expect(draft).toMatchObject({ status: "draft", po_number: "BUYER-123", note: "Deliver after lunch", customer_id: customer.customerId, ship_to_id: customer.shipToId, from_location_id: source.id, requested_ship_date: null });
    expect((await admin.from("order_lines").select("sku_id,qty_ordered,qty_picked,qty_shipped").eq("order_id", result.order_id)).data)
      .toEqual([{ sku_id: catalog.skuId, qty_ordered: 2, qty_picked: null, qty_shipped: null }]);
    // The source order names its draft, and a second reorder is refused rather than creating another.
    expect((await admin.from("order_events").select("event,payload").eq("order_id", original.order_id).order("created_at")).data?.at(-1))
      .toEqual({ event: "reorder_created", payload: { order_id: result.order_id, order_no: draft.order_no } });
    const again = await db.rpc("reorder_refused_delivery", { p_order: original.order_id, p_request_id: crypto.randomUUID() });
    expect(again.error?.message).toMatch(/already reordered/i);
    expect((await admin.from("orders").select("id").eq("customer_id", customer.customerId)).data).toHaveLength(2);
  });

  it("serializes distinct workers racing shipment and adjustment so only one transition wins", async () => {
    const [shipperDb, adjusterDb] = await Promise.all([asUser(staffEmail), asUser(staffEmail)]);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const id = await confirmedOrder(6);
      const line = await lineOf(id);
      await staffDb.rpc("record_pick", {
        p_order: id,
        p_picks: [{ line_id: line.id, qty_picked: 6 }],
        p_request_id: crypto.randomUUID(),
      });
      const [ship, adjust] = await Promise.all([
        shipperDb.rpc("ship_order", {
          p_order: id,
          p_ship: [{ line_id: line.id, qty_shipped: 4, short_reason: "two kegs dented" }],
          p_carrier: null,
          p_tracking: null,
          p_request_id: crypto.randomUUID(),
        }),
        adjusterDb.rpc("adjust_order_lines", {
          p_order: id,
          p_lines: [{ sku_id: skuId, qty: 4 }],
          p_reason: `concurrent customer change ${attempt}`,
          p_request_id: crypto.randomUUID(),
        }),
      ]);
      expect([ship, adjust].filter((result) => result.error === null)).toHaveLength(1);
      const persisted = await admin.from("orders").select("status,needs_restock").eq("id", id).single();
      expect(["picked", "shipped"]).toContain(persisted.data?.status);
      if (ship.error === null) {
        expect(persisted.data).toEqual({ status: "shipped", needs_restock: true });
      } else {
        expect(persisted.data).toEqual({ status: "picked", needs_restock: true });
        expect(ship.error.message).toMatch(/waiting for restock/);
      }
      expect((await admin.from("order_events").select("event").eq("order_id", id).in("event", ["lines_adjusted", "shipped"])).data)
        .toHaveLength(1);
      expect((await admin.from("shipments").select("id").eq("order_id", id)).data)
        .toHaveLength(ship.error === null ? 1 : 0);
    }
  });

  it("short ship writes movement + invoice for shipped qty and fulfills allocations", async () => {
    const id = await confirmedOrder(10);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 8 }], p_request_id: crypto.randomUUID() });
    const { data, error } = await staffDb.rpc("ship_order", { p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 8 }], p_carrier: "self", p_tracking: null, p_request_id: crypto.randomUUID() });
    expect(error).toBeNull();
    const inv = (data as { invoice_id: string }).invoice_id;
    const { data: mv } = await admin.from("inventory_movements").select().eq("ref", id);
    expect(mv!.length).toBe(1);
    expect(Number(mv![0].qty)).toBe(-8);
    expect(mv![0].type).toBe("sale_removal");
    expect(mv![0].dest_state).toBe("PA");
    // The removal is classified by the brewery's Wholesale channel, and the
    // channel's tax treatment is frozen onto the row (§16.3).
    assert(mv?.[0].sale_channel_id);
    const { data: ch } = await admin.from("sale_channels").select("name,tax_treatment").eq("id", mv![0].sale_channel_id).single();
    expect(ch!.name).toBe("Wholesale");
    expect(ch!.tax_treatment).toBe("taxable");
    expect(mv![0].tax_treatment).toBe("taxable");
    const { data: il } = await admin.from("invoice_lines").select().eq("invoice_id", inv);
    expect(Number(il![0].qty)).toBe(8);
    expect(il![0].unit_price_cents).toBe(12000);
    const { data: alloc } = await admin.from("allocations").select().eq("ref", line.id).single();
    expect(alloc!.status).toBe("fulfilled");
    const { data: o } = await admin.from("orders").select().eq("id", id).single();
    expect(o!.status).toBe("shipped");
  });
  it("requires an explicit put-back event before a changed picked order can be picked again", async () => {
    const id = await confirmedOrder(10);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 10 }], p_request_id: crypto.randomUUID() });
    await staffDb.rpc("adjust_order_lines", { p_order: id, p_lines: [{ sku_id: skuId, qty: 6 }], p_reason: "cut", p_request_id: crypto.randomUUID() });
    let { data: o } = await admin.from("orders").select().eq("id", id).single();
    expect(o!.needs_restock).toBe(true);
    const l2 = await lineOf(id);
    const shipRequestId = crypto.randomUUID();
    const beforeRepick = await staffDb.rpc("ship_order", {
      p_order: id, p_ship: [{ line_id: l2.id, qty_shipped: 6 }],
      p_carrier: null, p_tracking: null, p_request_id: shipRequestId,
    });
    expect(beforeRepick.error?.message).toMatch(/waiting for restock/);
    expect((await admin.from("shipments").select("id").eq("order_id", id)).data).toEqual([]);
    expect((await admin.from("inventory_movements").select("id").eq("ref", id)).data).toEqual([]);
    const repick = await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: l2.id, qty_picked: 6 }], p_request_id: crypto.randomUUID() });
    expect(repick.error?.message).toMatch(/put back/i);
    expect((await lineOf(id)).qty_picked).toBe(10);
    const restocked = await staffDb.rpc("confirm_restock", { p_order: id, p_request_id: crypto.randomUUID() });
    expect(restocked.error).toBeNull();
    const picked = await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: l2.id, qty_picked: 6 }], p_request_id: crypto.randomUUID() });
    expect(picked.error).toBeNull();
    expect((await admin.from("order_events").select("payload").eq("order_id", id).eq("event", "restocked").single()).data?.payload)
      .toMatchObject({ lines: [{ line_id: l2.id, qty: 4 }] });
    ({ data: o } = await admin.from("orders").select().eq("id", id).single());
    expect(o!.needs_restock).toBe(false);
    const afterRepick = await staffDb.rpc("ship_order", {
      p_order: id, p_ship: [{ line_id: l2.id, qty_shipped: 6 }],
      p_carrier: null, p_tracking: null, p_request_id: shipRequestId,
    });
    expect(afterRepick.error).toBeNull();
    expect((await admin.from("shipments").select("id").eq("order_id", id)).data).toHaveLength(1);
    expect((await admin.from("inventory_movements").select("id").eq("ref", id)).data).toHaveLength(1);
  });
  it("ship with all lines qty_shipped 0 creates no invoice and releases allocations", async () => {
    const id = await confirmedOrder(4);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 0 }], p_request_id: crypto.randomUUID() });
    const { data, error } = await staffDb.rpc("ship_order", { p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 0 }], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() });
    expect(error).toBeNull();
    expect((data as { invoice_id: string | null }).invoice_id).toBeNull();
    const { data: shipment } = await admin.from("shipments").select().eq("order_id", id).single();
    const { data: invs } = await admin.from("invoices").select().eq("shipment_id", shipment!.id);
    expect(invs!.length).toBe(0);
    const { data: o } = await admin.from("orders").select().eq("id", id).single();
    expect(o!.status).toBe("shipped");
    const { data: alloc } = await admin.from("allocations").select().eq("ref", line.id).single();
    expect(alloc!.status).toBe("released");
  });
  it("refuses a pick above the ordered quantity and leaves the order untouched (#471)", async () => {
    const id = await confirmedOrder(10);
    const line = await lineOf(id);
    const over = await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 12 }], p_request_id: crypto.randomUUID() });
    expect(over.error?.message).toMatch(/cannot exceed ordered/);
    expect(await lineOf(id)).toMatchObject({ qty_ordered: 10, qty_picked: null });
    expect((await admin.from("orders").select("status").eq("id", id).single()).data).toEqual({ status: "confirmed" });
    const exact = await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 10 }], p_request_id: crypto.randomUUID() });
    expect(exact.error).toBeNull();
    expect(await lineOf(id)).toMatchObject({ qty_ordered: 10, qty_picked: 10 });
    // Release the open allocation so later ATP assertions in this file see the same stock.
    expect((await staffDb.rpc("cancel_order", { p_order: id, p_reason: "test cleanup", p_request_id: crypto.randomUUID() })).error).toBeNull();
  });
  it("ship rejects when p_ship omits an order line", async () => {
    const id = await confirmedOrder(3);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 3 }], p_request_id: crypto.randomUUID() });
    const { error } = await staffDb.rpc("ship_order", { p_order: id, p_ship: [], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/ship list must cover/);
  });
});

describe("credit memo", () => {
  it("writes negative invoice lines and return_in movements, and logs an order_events row", async () => {
    const id = await confirmedOrder(5);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 5 }], p_request_id: crypto.randomUUID() });
    const { data: shipped, error: shipErr } = await staffDb.rpc("ship_order", { p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 5 }], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() });
    expect(shipErr).toBeNull();
    const invId = (shipped as { invoice_id: string }).invoice_id;
    const { data: il } = await admin.from("invoice_lines").select().eq("invoice_id", invId).single();
    const { data: cm, error } = await staffDb.rpc("create_credit_memo", {
      p_invoice: invId, p_lines: [{ invoice_line_id: il!.id, qty: 2 }], p_location: whId, p_reason: "damaged", p_request_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    const cmId = (cm as { invoice_id: string }).invoice_id;
    const { data: cmLines } = await admin.from("invoice_lines").select().eq("invoice_id", cmId);
    expect(Number(cmLines![0].qty)).toBe(-2);
    expect(cmLines![0].unit_price_cents).toBe(12000);
    const { data: ret } = await admin.from("inventory_movements").select().eq("type", "return_in").eq("brewery_id", b.id);
    expect(ret!.some(m => Number(m.qty) === 2)).toBe(true);
    const { data: events } = await admin.from("order_events").select().eq("order_id", id).eq("event", "credit_memo");
    expect(events!.length).toBe(1);
    const payload = events![0].payload as { invoice_id: string; credit_memo_id: string; reason: string };
    expect(payload.invoice_id).toBe(invId);
    expect(payload.credit_memo_id).toBe(cmId);
    expect(payload.reason).toBe("damaged");

    // Over-credit guard: 2 of 5 already credited above; 4 more would exceed
    // the remaining 3, 3 more exactly exhausts it.
    const { error: overErr } = await staffDb.rpc("create_credit_memo", {
      p_invoice: invId, p_lines: [{ invoice_line_id: il!.id, qty: 4 }], p_location: whId, p_reason: "damaged again", p_request_id: crypto.randomUUID(),
    });
    expect(overErr).not.toBeNull();
    expect(overErr?.message).toMatch(/credit exceeds remaining creditable qty/);
    const { error: exactErr } = await staffDb.rpc("create_credit_memo", {
      p_invoice: invId, p_lines: [{ invoice_line_id: il!.id, qty: 3 }], p_location: whId, p_reason: "rest", p_request_id: crypto.randomUUID(),
    });
    expect(exactErr).toBeNull();
  });
});

describe("credit memo on a settled-without-payment invoice", () => {
  // #418: a written-off or QuickBooks-voided/deleted invoice is no longer owed,
  // so crediting it would pay the customer back for money they never paid.
  it.each([
    ["written off", { written_off_at: new Date().toISOString(), written_off_reason: "uncollectable" }],
    ["voided in QuickBooks", { qbo_remote_state: "voided" as const }],
    ["deleted in QuickBooks", { qbo_remote_state: "deleted" as const }],
  ])("refuses a credit memo and a return on an invoice %s", async (_state, patch) => {
    // Restock what this case ships, so later ATP assertions see the same stock.
    await ins("inventory_movements", { brewery_id: b.id, sku_id: skuId, location_id: whId, bin_id: whBinId, qty: 2, type: "opening_balance", created_by: staffId });
    const id = await confirmedOrder(2);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 2 }], p_request_id: crypto.randomUUID() });
    const { data: shipped } = await staffDb.rpc("ship_order", { p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 2 }], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() });
    const invId = (shipped as { invoice_id: string }).invoice_id;
    const { data: il } = await admin.from("invoice_lines").select().eq("invoice_id", invId).single();
    expect((await admin.from("invoices").update("written_off_at" in patch ? { ...patch, written_off_by: staffId } : patch).eq("id", invId)).error).toBeNull();
    const memo = await staffDb.rpc("create_credit_memo", {
      p_invoice: invId, p_lines: [{ invoice_line_id: il!.id, qty: 1 }], p_location: whId, p_reason: "damaged", p_request_id: crypto.randomUUID(),
    });
    expect(memo.error?.message).toMatch(/cannot credit a voided or written-off invoice/);
    const ret = await staffDb.rpc("return_shipment", {
      p_invoice: invId, p_lines: [{ invoice_line_id: il!.id, qty: 1 }], p_location: whId, p_reason: "unsold", p_request_id: crypto.randomUUID(),
    });
    expect(ret.error?.message).toMatch(/cannot credit a voided or written-off invoice/);
    expect((await admin.from("invoice_lines").select("id").eq("credited_invoice_line_id", il!.id)).data).toEqual([]);
  });
});

describe("credit memo concurrency", () => {
  it("two concurrent credit memos for the full qty produce exactly one credit", async () => {
    const id = await confirmedOrder(4);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 4 }], p_request_id: crypto.randomUUID() });
    const { data: shipped } = await staffDb.rpc("ship_order", { p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 4 }], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() });
    const invId = (shipped as { invoice_id: string }).invoice_id;
    const { data: il } = await admin.from("invoice_lines").select().eq("invoice_id", invId).single();
    const memo = () => staffDb.rpc("create_credit_memo", {
      p_invoice: invId, p_lines: [{ invoice_line_id: il!.id, qty: 4 }], p_location: whId, p_reason: "race", p_request_id: crypto.randomUUID(),
    });
    const results = await Promise.all([memo(), memo()]);
    expect(results.filter(r => r.error === null).length).toBe(1);
    const { data: credits } = await admin.from("invoice_lines").select("qty").eq("credited_invoice_line_id", il!.id);
    expect(credits!.reduce((sum, c) => sum + Number(c.qty), 0)).toBe(-4);
  });
});

describe("replenishment", () => {
  it("creates a confirmed taproom_transfer order; shipping it moves stock between locations, no invoice", async () => {
    const { data, error } = await staffDb.rpc("create_replenishment_order", {
      p_from: whId, p_to: tapId, p_lines: [{ sku_id: skuId, qty: 3 }], p_request_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    const id = (data as { order_id: string }).order_id;
    const { data: o } = await admin.from("orders").select().eq("id", id).single();
    expect(o!.kind).toBe("taproom_transfer");
    expect(o!.status).toBe("confirmed");
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 3 }], p_request_id: crypto.randomUUID() });
    const { data: shipRes, error: shipErr } = await staffDb.rpc("ship_order", { p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 3 }], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() });
    expect(shipErr).toBeNull();
    expect((shipRes as { invoice_id: string | null }).invoice_id).toBeNull();
    const { data: mv } = await admin.from("inventory_movements").select().eq("ref", id).eq("type", "taproom_transfer");
    expect(mv!.length).toBe(2);
    expect(Number(mv!.find(m => m.location_id === tapId)!.qty)).toBe(3);
  });

  it("rejects a transfer whose source and destination are the same location (#454)", async () => {
    const replen = await staffDb.rpc("create_replenishment_order", {
      p_from: tapId, p_to: tapId, p_lines: [{ sku_id: skuId, qty: 1 }], p_request_id: crypto.randomUUID(),
    });
    expect(replen.error?.message).toBe("A transfer needs a different source and destination location.");
    const draft = await staffDb.rpc("create_order", {
      p_brewery: b.id, p_kind: "taproom_transfer", p_customer: null, p_ship_to: null,
      p_from_location: tapId, p_to_location: tapId, p_requested: null, p_po: null, p_note: null,
      p_lines: [{ sku_id: skuId, qty: 1 }], p_request_id: crypto.randomUUID(),
    });
    expect(draft.error?.message).toBe("A transfer needs a different source and destination location.");
    const { count } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("brewery_id", b.id).eq("to_location_id", tapId).eq("from_location_id", tapId);
    expect(count).toBe(0);
  });
});

describe("confirm_restock", () => {
  it("clears needs_restock and writes an order event; no movement", async () => {
    const id = await confirmedOrder(4);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 4 }], p_request_id: crypto.randomUUID() });
    await staffDb.rpc("adjust_order_lines", { p_order: id, p_lines: [{ sku_id: skuId, qty: 2 }], p_reason: "cut", p_request_id: crypto.randomUUID() });
    const before = await admin.from("inventory_movements").select("id").eq("ref", id);
    const { data, error } = await staffDb.rpc("confirm_restock", { p_order: id, p_request_id: crypto.randomUUID() });
    expect(error).toBeNull();
    expect((data as { order_id: string }).order_id).toBe(id);
    const { data: o } = await admin.from("orders").select("needs_restock").eq("id", id).single();
    expect(o!.needs_restock).toBe(false);
    const { data: ev } = await admin.from("order_events").select("event").eq("order_id", id).eq("event", "restocked");
    expect(ev!.length).toBe(1);
    const after = await admin.from("inventory_movements").select("id").eq("ref", id);
    expect(after.data!.length).toBe(before.data!.length);
  });

  // #416: put back after an adjust-down must record what went back, so the
  // later ship of the adjusted quantity does not re-flag the same beer.
  // Small quantities: this file shares a 100-unit opening balance (get_shortfalls).
  it("lowers picked to what the order keeps, so shipping the adjusted amount does not re-flag", async () => {
    const id = await confirmedOrder(3);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 3 }], p_request_id: crypto.randomUUID() });
    await staffDb.rpc("adjust_order_lines", { p_order: id, p_lines: [{ sku_id: skuId, qty: 1 }], p_reason: "cut", p_request_id: crypto.randomUUID() });
    const adjusted = await lineOf(id);
    expect((await staffDb.rpc("confirm_restock", { p_order: id, p_request_id: crypto.randomUUID() })).error).toBeNull();
    expect(await lineOf(id)).toMatchObject({ qty_ordered: 1, qty_picked: 1 });
    const { data: ev } = await admin.from("order_events").select("payload").eq("order_id", id).eq("event", "restocked").single();
    expect(ev!.payload).toEqual({ lines: [{ line_id: adjusted.id, qty: 2 }] });

    const shipped = await staffDb.rpc("ship_order", {
      p_order: id, p_ship: [{ line_id: adjusted.id, qty_shipped: 1 }],
      p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID(),
    });
    expect(shipped.error).toBeNull();
    expect((await admin.from("orders").select("status,needs_restock").eq("id", id).single()).data)
      .toEqual({ status: "shipped", needs_restock: false });
  });

  it("after a short ship, puts back picked − shipped", async () => {
    const id = await confirmedOrder(3);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 3 }], p_request_id: crypto.randomUUID() });
    await staffDb.rpc("ship_order", {
      p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 1, short_reason: "two kegs dented" }],
      p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID(),
    });
    expect((await staffDb.rpc("confirm_restock", { p_order: id, p_request_id: crypto.randomUUID() })).error).toBeNull();
    expect(await lineOf(id)).toMatchObject({ qty_ordered: 3, qty_picked: 1, qty_shipped: 1 });
    const { data: ev } = await admin.from("order_events").select("payload").eq("order_id", id).eq("event", "restocked").single();
    expect(ev!.payload).toEqual({ lines: [{ line_id: line.id, qty: 2 }] });
  });

  it("is a conflict when the flag is already clear", async () => {
    const id = await confirmedOrder(2);
    const { error } = await staffDb.rpc("confirm_restock", { p_order: id, p_request_id: crypto.randomUUID() });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not waiting for restock/);
  });
});

describe("resolve_short_pick", () => {
  it("adjust_down shrinks the line and allocation to the counted qty", async () => {
    const id = await confirmedOrder(10);
    const line = await lineOf(id);
    const { error } = await staffDb.rpc("resolve_short_pick", {
      p_order: id, p_line: line.id, p_qty_picked: 7, p_reason: "short in pick face",
      p_resolution: "adjust_down", p_request_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    const after = await lineOf(id);
    expect(Number(after.qty_ordered)).toBe(7);
    expect(Number(after.qty_picked)).toBe(7);
    expect(after.short_reason).toBe("short in pick face");
    const { data: alloc } = await admin.from("allocations").select("qty,status").eq("ref", line.id).single();
    expect(Number(alloc!.qty)).toBe(7);
    expect(alloc!.status).toBe("open");
  });

  it("keep_owed records the count and leaves the order picked but still owed", async () => {
    const id = await confirmedOrder(10);
    const line = await lineOf(id);
    const { error } = await staffDb.rpc("resolve_short_pick", {
      p_order: id, p_line: line.id, p_qty_picked: 7, p_reason: "will finish tomorrow",
      p_resolution: "keep_owed", p_request_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    const after = await lineOf(id);
    expect(Number(after.qty_ordered)).toBe(10);
    expect(Number(after.qty_picked)).toBe(7);
    const { data: o } = await admin.from("orders").select("status").eq("id", id).single();
    expect(o!.status).toBe("picked");
    const { data: ev } = await admin.from("order_events").select("payload").eq("order_id", id).eq("event", "short_pick").single();
    expect(ev!.payload).toMatchObject({ resolution: "keep_owed", qty_picked: 7 });
  });

  // #419/#514: neither resolving a short nor recording a pick marks the order
  // picked while another line has never been counted.
  it("leaves the order confirmed until every line has a count", async () => {
    const cat2 = await seedCatalog(b.id, { product: "Pils", sku: "Pils 1/2bbl", packageType: "keg", bblPerUnit: 0.5, format: "Pils keg #419" });
    await priceSku(b.id, { saleChannelId, brandId: cat2.brandId, formatId: cat2.formatId, cents: 11000 });
    await ins("inventory_movements", { brewery_id: b.id, sku_id: cat2.skuId, location_id: whId, bin_id: whBinId, qty: 50, type: "opening_balance", created_by: staffId });
    const { data, error } = await staffDb.rpc("create_order", {
      p_brewery: b.id, p_kind: "wholesale", p_customer: customerId, p_ship_to: shipToId,
      p_from_location: whId, p_to_location: null, p_requested: null, p_po: null, p_note: null,
      p_lines: [{ sku_id: skuId, qty: 10 }, { sku_id: cat2.skuId, qty: 5 }],
      p_request_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    const id = (data as { order_id: string }).order_id;
    await staffDb.rpc("submit_order", { p_order: id, p_request_id: crypto.randomUUID() });
    await staffDb.rpc("confirm_order", { p_order: id, p_request_id: crypto.randomUUID() });
    const { data: lines } = await admin.from("order_lines").select("id, sku_id").eq("order_id", id);
    const a = lines!.find(l => l.sku_id === skuId)!, bLine = lines!.find(l => l.sku_id === cat2.skuId)!;

    const short = await staffDb.rpc("resolve_short_pick", {
      p_order: id, p_line: a.id, p_qty_picked: 7, p_reason: "short in pick face",
      p_resolution: "keep_owed", p_request_id: crypto.randomUUID(),
    });
    expect(short.error).toBeNull();
    const status = async () => (await admin.from("orders").select("status").eq("id", id).single()).data!.status;
    expect(await status()).toBe("confirmed");

    // record_pick answers the same question (#514): a pick that leaves a line uncounted is not the order picked.
    const partial = await staffDb.rpc("record_pick", {
      p_order: id, p_picks: [{ line_id: a.id, qty_picked: 7 }], p_request_id: crypto.randomUUID(),
    });
    expect(partial.error).toBeNull();
    expect(await status()).toBe("confirmed");

    const pick = await staffDb.rpc("record_pick", {
      p_order: id, p_picks: [{ line_id: a.id, qty_picked: 7 }, { line_id: bLine.id, qty_picked: 5 }],
      p_request_id: crypto.randomUUID(),
    });
    expect(pick.error).toBeNull();
    expect(await status()).toBe("picked");
    // Release the reservations so later get_shortfalls checks see this SKU's ATP untouched.
    const cancel = await staffDb.rpc("cancel_order", { p_order: id, p_reason: "test cleanup", p_request_id: crypto.randomUUID() });
    expect(cancel.error).toBeNull();
  });

  it("rejects a count that is not short, and an empty reason", async () => {
    const id = await confirmedOrder(3);
    const line = await lineOf(id);
    const full = await staffDb.rpc("resolve_short_pick", { p_order: id, p_line: line.id, p_qty_picked: 3, p_reason: "x", p_resolution: "keep_owed", p_request_id: crypto.randomUUID() });
    expect(full.error?.message).toMatch(/not short/);
    const blank = await staffDb.rpc("resolve_short_pick", { p_order: id, p_line: line.id, p_qty_picked: 1, p_reason: " ", p_resolution: "keep_owed", p_request_id: crypto.randomUUID() });
    expect(blank.error?.message).toMatch(/reason/);
  });
});

describe("ship invoice timing", () => {
  it("on_delivery ship posts movements and no invoice", async () => {
    const id = await confirmedOrder(4);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 4 }], p_request_id: crypto.randomUUID() });
    const { data, error } = await staffDb.rpc("ship_order", {
      p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 4 }],
      p_carrier: null, p_tracking: null, p_invoice_timing: "on_delivery",
      p_request_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    expect((data as { invoice_id: string | null }).invoice_id).toBeNull();
    const { data: sh } = await admin.from("shipments").select("id, invoice_timing").eq("order_id", id).single();
    expect(sh!.invoice_timing).toBe("on_delivery");
    const { data: invs } = await admin.from("invoices").select("id").eq("shipment_id", sh!.id);
    expect(invs!.length).toBe(0);
    const { data: mv } = await admin.from("inventory_movements").select("type").eq("ref", id);
    expect(mv!.map((m) => m.type)).toEqual(["sale_removal"]);
  });

  it("short ship below picked sets needs_restock", async () => {
    const id = await confirmedOrder(10);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 10 }], p_request_id: crypto.randomUUID() });
    const { error } = await staffDb.rpc("ship_order", {
      p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 9, short_reason: "one keg dented" }],
      p_carrier: null, p_tracking: null, p_invoice_timing: "now",
      p_request_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    const { data: o } = await admin.from("orders").select("needs_restock").eq("id", id).single();
    expect(o!.needs_restock).toBe(true);
  });
});

describe("confirm_delivery", () => {
  it("invoices an on_delivery shipment once, signs the stop, and moves nothing", async () => {
    const id = await confirmedOrder(3);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 3 }], p_request_id: crypto.randomUUID() });
    await staffDb.rpc("ship_order", {
      p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 3 }],
      p_carrier: null, p_tracking: null, p_invoice_timing: "on_delivery", p_request_id: crypto.randomUUID(),
    });
    const { data: sh } = await admin.from("shipments").select("id").eq("order_id", id).single();
    const { data: route } = await admin.from("routes").insert({ brewery_id: b.id, delivery_date: "2026-09-08", driver_user_id: staffId, name: "A", departed_at: new Date().toISOString() }).select().single();
    const { data: del } = await admin.from("deliveries").insert({ brewery_id: b.id, route_id: route!.id, shipment_id: sh!.id, stop_no: 1 }).select().single();
    const mvBefore = await admin.from("inventory_movements").select("id").eq("ref", id);
    const { data, error } = await staffDb.rpc("confirm_delivery", { p_delivery: del!.id, p_signed_by: "Dana", p_request_id: crypto.randomUUID() });
    expect(error).toBeNull();
    const invoiceId = (data as { invoice_id: string }).invoice_id;
    expect(invoiceId).toMatch(/^[0-9a-f-]{36}$/i);
    const { data: d2 } = await admin.from("deliveries").select("signed_by,delivered_at").eq("id", del!.id).single();
    expect(d2!.signed_by).toBe("Dana");
    expect(d2!.delivered_at).not.toBeNull();
    const { data: il } = await admin.from("invoice_lines").select("qty, unit_price_cents").eq("invoice_id", invoiceId);
    expect(il).toEqual([{ qty: 3, unit_price_cents: 12000 }]);
    const mvAfter = await admin.from("inventory_movements").select("id").eq("ref", id);
    expect(mvAfter.data!.length).toBe(mvBefore.data!.length);
    const again = await staffDb.rpc("confirm_delivery", { p_delivery: del!.id, p_signed_by: "Dana", p_request_id: crypto.randomUUID() });
    expect(again.error?.message).toMatch(/already delivered/);
    const stop = await runCommand("get_delivery_stop", { deliveryId: del!.id }, { db: staffDb, userId: staffId, breweryId: b.id, roles: ["admin"] }) as
      { delivery: { signed_by: string; shipments: { invoice_timing: string } }; lines: { qty: number }[]; invoice: { id: string } | null };
    expect(stop.delivery.signed_by).toBe("Dana");
    expect(stop.delivery.shipments.invoice_timing).toBe("on_delivery");
    expect(stop.lines.map((l) => l.qty)).toEqual([3]);
    expect(stop.invoice?.id).toBe(invoiceId);
  });
});

describe("return_shipment", () => {
  it("unsold return credits at the invoiced price and restocks; damaged also posts loss", async () => {
    const id = await confirmedOrder(5);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 5 }], p_request_id: crypto.randomUUID() });
    const shipped = await staffDb.rpc("ship_order", {
      p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 5 }],
      p_carrier: null, p_tracking: null, p_invoice_timing: "now", p_request_id: crypto.randomUUID(),
    });
    const invId = (shipped.data as { invoice_id: string }).invoice_id;
    const { data: il } = await admin.from("invoice_lines").select().eq("invoice_id", invId).single();

    const unsold = await staffDb.rpc("return_shipment", {
      p_invoice: invId, p_location: whId, p_reason: "unsold",
      p_lines: [{ invoice_line_id: il!.id, qty: 1 }], p_request_id: crypto.randomUUID(),
    });
    expect(unsold.error).toBeNull();
    const memoId = (unsold.data as { credit_memo_id: string }).credit_memo_id;
    const { data: memoLines } = await admin.from("invoice_lines").select("qty, unit_price_cents").eq("invoice_id", memoId);
    expect(memoLines).toEqual([{ qty: -1, unit_price_cents: 12000 }]); // credited at the invoiced price
    const { data: back } = await admin.from("inventory_movements").select("type,qty,location_id").eq("ref", memoId);
    expect(back).toEqual([{ type: "return_in", qty: 1, location_id: whId }]);

    const damaged = await staffDb.rpc("return_shipment", {
      p_invoice: invId, p_location: whId, p_reason: "damaged",
      p_lines: [{ invoice_line_id: il!.id, qty: 1 }], p_request_id: crypto.randomUUID(),
    });
    expect(damaged.error).toBeNull();
    const memo2 = (damaged.data as { credit_memo_id: string }).credit_memo_id;
    const { data: mvs } = await admin.from("inventory_movements").select("type,qty").eq("ref", memo2);
    expect(mvs!.sort((a, b) => a.type.localeCompare(b.type))).toEqual([{ type: "loss", qty: -1 }, { type: "return_in", qty: 1 }]);
  });
});

describe("release_allocation and get_shortfalls", () => {
  it("get_shortfalls lists negative-ATP skus; release_allocation frees the reservation", async () => {
    const ctx = { db: staffDb, userId: staffId, breweryId: b.id, roles: ["admin" as const] };
    const id = await confirmedOrder(1000); // opening balance is 100
    const line = await lineOf(id);
    const { data: alloc } = await admin.from("allocations").select("id").eq("ref", line.id).single();
    const short = await runCommand("get_shortfalls", {}, ctx) as { skuId: string; skuName: string; atp: number }[];
    const row = short.find((s) => s.skuId === skuId);
    expect(row).toBeDefined();
    expect(row!.atp).toBeLessThan(0);
    expect(row!.skuName).toBe("IPA 1/2bbl");
    await runCommand("release_allocation", { allocationId: alloc!.id }, ctx);
    const { data: a2 } = await admin.from("allocations").select("status").eq("id", alloc!.id).single();
    expect(a2!.status).toBe("released");
    const after = await runCommand("get_shortfalls", {}, ctx) as { skuId: string }[];
    expect(after.some((s) => s.skuId === skuId)).toBe(false);
    await expect(runCommand("release_allocation", { allocationId: alloc!.id }, ctx)).rejects.toThrow(/not open/);
  });
});

describe("frozen tax treatment on a wholesale ship", () => {
  it("a customer's tax_treatment overrides the channel default on the movement", async () => {
    const { customerId: exporterId, shipToId: exporterShipTo } = await seedCustomer(b.id, { name: "Exporter", saleChannelId });
    await admin.from("customers").update({ tax_treatment: "export" }).eq("id", exporterId);
    const { data, error } = await staffDb.rpc("create_order", {
      p_brewery: b.id, p_kind: "wholesale", p_customer: exporterId, p_ship_to: exporterShipTo,
      p_from_location: whId, p_to_location: null, p_requested: null, p_po: null, p_note: null,
      p_lines: [{ sku_id: skuId, qty: 2 }], p_request_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    const id = (data as { order_id: string }).order_id;
    await staffDb.rpc("submit_order", { p_order: id, p_request_id: crypto.randomUUID() });
    await staffDb.rpc("confirm_order", { p_order: id, p_request_id: crypto.randomUUID() });
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 2 }], p_request_id: crypto.randomUUID() });
    const ship = await staffDb.rpc("ship_order", { p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 2 }], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() });
    expect(ship.error).toBeNull();
    const { data: mv } = await admin.from("inventory_movements").select("sale_channel_id, tax_treatment").eq("ref", id).single();
    expect(mv!.sale_channel_id).toBe(await channelId(b.id, "Wholesale"));
    expect(mv!.tax_treatment).toBe("export");
  });

  it("a DTC customer's ship posts the removal to DTC, with DTC's tax treatment", async () => {
    // The removal follows orders.sale_channel_id (copied from the customer),
    // not the brewery's Wholesale default: same brewery, same sku, other channel.
    const dtc = await channelId(b.id, "DTC");
    // Both channels seed as 'taxable', so give DTC a distinct treatment: the
    // assertion below then can only pass if the movement read the DTC channel.
    await admin.from("sale_channels").update({ tax_treatment: "vessel_supplies" }).eq("id", dtc);
    const { customerId: dtcId, shipToId: dtcShipTo } = await seedCustomer(b.id, { name: "Taproom Fan", saleChannelId: dtc });
    const { data: brandRow } = await admin.from("skus").select("brand_id").eq("id", skuId).single();
    await priceSku(b.id, { saleChannelId: dtc, brandId: brandRow!.brand_id, formatId: (await admin.from("skus").select("format_id").eq("id", skuId).single()).data!.format_id, cents: 900 });
    const { data, error } = await staffDb.rpc("create_order", {
      p_brewery: b.id, p_kind: "wholesale", p_customer: dtcId, p_ship_to: dtcShipTo,
      p_from_location: whId, p_to_location: null, p_requested: null, p_po: null, p_note: null,
      p_lines: [{ sku_id: skuId, qty: 3 }], p_request_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    const id = (data as { order_id: string }).order_id;
    await staffDb.rpc("submit_order", { p_order: id, p_request_id: crypto.randomUUID() });
    await staffDb.rpc("confirm_order", { p_order: id, p_request_id: crypto.randomUUID() });
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 3 }], p_request_id: crypto.randomUUID() });
    const ship = await staffDb.rpc("ship_order", { p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 3 }], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() });
    expect(ship.error).toBeNull();
    const { data: mv } = await admin.from("inventory_movements").select("sale_channel_id, tax_treatment").eq("ref", id).single();
    expect(mv!.sale_channel_id).toBe(dtc);
    expect(mv!.tax_treatment).toBe("vessel_supplies");
    const { data: ws } = await admin.from("sale_channels").select("tax_treatment").eq("id", saleChannelId).single();
    expect(ws!.tax_treatment).toBe("taxable");
  });
});

// #811: an added or raised line on a picked order is unpicked work. Adjust
// sends the order back to confirmed (the line uncounted), Ship stays hidden
// until Pick counts it, and ship refuses any line that has no count.
describe("adjust after pick (#811)", () => {
  let pilsSkuId: string;
  beforeAll(async () => {
    const cat2 = await seedCatalog(b.id, { product: "Helles", sku: "Helles 1/2bbl #811", packageType: "keg", bblPerUnit: 0.5, format: "Helles keg #811" });
    pilsSkuId = cat2.skuId;
    await priceSku(b.id, { saleChannelId, brandId: cat2.brandId, formatId: cat2.formatId, cents: 11000 });
    await ins("inventory_movements", { brewery_id: b.id, sku_id: pilsSkuId, location_id: whId, bin_id: whBinId, qty: 50, type: "opening_balance", created_by: staffId });
  });
  const lineFor = async (orderId: string, sku: string) =>
    (await admin.from("order_lines").select().eq("order_id", orderId).eq("sku_id", sku).single()).data!;
  const pickAll = async (id: string) => {
    const { data } = await admin.from("order_lines").select("id, qty_ordered").eq("order_id", id);
    const r = await staffDb.rpc("record_pick", { p_order: id, p_picks: data!.map((l) => ({ line_id: l.id, qty_picked: Number(l.qty_ordered) })), p_request_id: crypto.randomUUID() });
    expect(r.error).toBeNull();
  };
  const adjust = (id: string, lines: { sku_id: string; qty: number }[], requestId = crypto.randomUUID()) =>
    staffDb.rpc("adjust_order_lines", { p_order: id, p_lines: lines, p_reason: "customer call", p_request_id: requestId });
  const orderRow = async (id: string) => (await admin.from("orders").select("status,needs_restock,repick_since").eq("id", id).single()).data!;

  it("adding a line sends the order back to confirmed; ship is refused until it is picked", async () => {
    const id = await confirmedOrder(10);
    await pickAll(id);
    expect((await adjust(id, [{ sku_id: skuId, qty: 10 }, { sku_id: pilsSkuId, qty: 5 }])).error).toBeNull();
    expect(await orderRow(id)).toMatchObject({ status: "confirmed", needs_restock: false });
    const ipa = await lineFor(id, skuId), pils = await lineFor(id, pilsSkuId);
    const refused = await staffDb.rpc("ship_order", {
      p_order: id, p_ship: [{ line_id: ipa.id, qty_shipped: 10 }, { line_id: pils.id, qty_shipped: 5 }],
      p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID(),
    });
    expect(refused.error?.message).toMatch(/order is confirmed/);
    expect((await admin.from("shipments").select("id").eq("order_id", id)).data).toEqual([]);
    await pickAll(id);
    expect((await orderRow(id)).status).toBe("picked");
    const shipped = await staffDb.rpc("ship_order", {
      p_order: id, p_ship: [{ line_id: ipa.id, qty_shipped: 10 }, { line_id: pils.id, qty_shipped: 5 }],
      p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID(),
    });
    expect(shipped.error).toBeNull();
    const inv = (shipped.data as { invoice_id: string }).invoice_id;
    expect((await admin.from("invoice_lines").select("sku_id").eq("invoice_id", inv).eq("kind", "sku")).data?.map((r) => r.sku_id).sort())
      .toEqual([skuId, pilsSkuId].sort());
  });

  it("raising a picked line uncounts it and sends the order back to confirmed without a restock flag", async () => {
    const id = await confirmedOrder(10);
    await pickAll(id);
    expect((await adjust(id, [{ sku_id: skuId, qty: 20 }])).error).toBeNull();
    expect(await orderRow(id)).toMatchObject({ status: "confirmed", needs_restock: false });
    expect((await lineOf(id)).qty_picked).toBeNull();
  });

  it("lowering one line and adding another both re-picks and flags restock", async () => {
    const id = await confirmedOrder(10);
    await pickAll(id);
    expect((await adjust(id, [{ sku_id: skuId, qty: 6 }, { sku_id: pilsSkuId, qty: 5 }])).error).toBeNull();
    expect(await orderRow(id)).toMatchObject({ status: "confirmed", needs_restock: true });
  });

  it("dropping a counted line flags restock and stays picked", async () => {
    const id = await confirmedOrder(10);
    const base = await lineOf(id);
    await staffDb.rpc("adjust_order_lines", { p_order: id, p_lines: [{ sku_id: skuId, qty: 10 }, { sku_id: pilsSkuId, qty: 5 }], p_reason: "add", p_request_id: crypto.randomUUID() });
    expect(base.id).toBeTruthy();
    await pickAll(id);
    expect((await adjust(id, [{ sku_id: skuId, qty: 10 }])).error).toBeNull();
    expect(await orderRow(id)).toMatchObject({ status: "picked", needs_restock: true });
  });

  it("a keep_owed line left unchanged does not reopen the order", async () => {
    const id = await confirmedOrder(10);
    await staffDb.rpc("adjust_order_lines", { p_order: id, p_lines: [{ sku_id: skuId, qty: 10 }, { sku_id: pilsSkuId, qty: 5 }], p_reason: "add", p_request_id: crypto.randomUUID() });
    const ipa = await lineFor(id, skuId), pils = await lineFor(id, pilsSkuId);
    expect((await staffDb.rpc("resolve_short_pick", { p_order: id, p_line: ipa.id, p_qty_picked: 7, p_reason: "short", p_resolution: "keep_owed", p_request_id: crypto.randomUUID() })).error).toBeNull();
    expect((await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: pils.id, qty_picked: 5 }], p_request_id: crypto.randomUUID() })).error).toBeNull();
    expect((await orderRow(id)).status).toBe("picked");
    expect((await adjust(id, [{ sku_id: skuId, qty: 10 }, { sku_id: pilsSkuId, qty: 4 }])).error).toBeNull();
    expect((await orderRow(id)).status).toBe("picked");
    expect(Number((await lineFor(id, skuId)).qty_picked)).toBe(7);
  });

  it("raising a line the staged count already covers keeps the count and the order picked", async () => {
    const id = await confirmedOrder(10);
    await pickAll(id);
    expect((await adjust(id, [{ sku_id: skuId, qty: 6 }])).error).toBeNull();
    expect(await orderRow(id)).toMatchObject({ status: "picked", needs_restock: true });
    expect((await adjust(id, [{ sku_id: skuId, qty: 8 }])).error).toBeNull();
    expect(await orderRow(id)).toMatchObject({ status: "picked", needs_restock: true, repick_since: null });
    expect(Number((await lineOf(id)).qty_picked)).toBe(10);
  });

  it("raising a short-picked line clears its stale short reason with its count", async () => {
    const id = await confirmedOrder(10);
    const line = await lineOf(id);
    expect((await staffDb.rpc("resolve_short_pick", { p_order: id, p_line: line.id, p_qty_picked: 7, p_reason: "dented", p_resolution: "keep_owed", p_request_id: crypto.randomUUID() })).error).toBeNull();
    expect((await adjust(id, [{ sku_id: skuId, qty: 12 }])).error).toBeNull();
    expect(await lineOf(id)).toMatchObject({ qty_picked: null, short_reason: null });
  });

  it("ship refuses a picked order with an uncounted line", async () => {
    const id = await confirmedOrder(10);
    await pickAll(id);
    expect((await admin.from("order_lines").update({ qty_picked: null }).eq("order_id", id)).error).toBeNull();
    const line = await lineOf(id);
    const r = await staffDb.rpc("ship_order", { p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 0 }], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() });
    expect(r.error?.message).toMatch(/every line must be picked/);
    expect((await admin.from("shipments").select("id").eq("order_id", id)).data).toEqual([]);
  });

  it("the changed-after-pick marker is set on demotion and cleared on re-pick", async () => {
    const id = await confirmedOrder(10);
    await pickAll(id);
    expect((await orderRow(id)).repick_since).toBeNull();
    await adjust(id, [{ sku_id: skuId, qty: 20 }]);
    expect((await orderRow(id)).repick_since).not.toBeNull();
    await pickAll(id);
    expect(await orderRow(id)).toMatchObject({ status: "picked", repick_since: null });
    await adjust(id, [{ sku_id: skuId, qty: 15 }]);
    expect((await orderRow(id)).repick_since).toBeNull();
  });

  it("a replayed adjust with the same requestId returns the stored result and does not demote twice", async () => {
    const id = await confirmedOrder(10);
    await pickAll(id);
    const requestId = crypto.randomUUID();
    const first = await adjust(id, [{ sku_id: skuId, qty: 20 }], requestId);
    const second = await adjust(id, [{ sku_id: skuId, qty: 20 }], requestId);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data).toEqual(first.data);
    expect((await admin.from("order_events").select("id").eq("order_id", id).eq("event", "lines_adjusted")).data).toHaveLength(1);
  });
});
