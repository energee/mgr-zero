// tests/commands-portal.test.ts — portal (customer role) command registry wiring:
// scoping to the caller's own customer, availability badges never leak raw ATP,
// and staff-only commands reject a customer ctx.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx, makeCustomerUser, asUser, seedCatalog, seedLocation, seedCustomer, priceSku } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

let b: { id: string }, adminCtx: Awaited<ReturnType<typeof makeStaffCtx>>;
let customerId: string, shipToId: string, saleChannelId: string, skuId: string, warehouseId: string, warehouseBinId: string;
let custCtx: { db: Awaited<ReturnType<typeof asUser>>; userId: string; breweryId: string; role: "customer"; customerId: string };

beforeAll(async () => {
  b = await makeBrewery();
  adminCtx = await makeStaffCtx(b.id, "admin");
  ({ id: warehouseId, binId: warehouseBinId } = await seedLocation(b.id));
  const cat = await seedCatalog(b.id);
  skuId = cat.skuId;
  ({ customerId, shipToId, saleChannelId } = await seedCustomer(b.id));
  await priceSku(b.id, { saleChannelId, brandId: cat.brandId, formatId: cat.formatId, cents: 3600 });
  // Put stock on hand so the "in" badge tier is reachable.
  const { data: loc } = await admin.from("locations").select("id").eq("id", warehouseId).single();
  await ins("inventory_movements", {
    brewery_id: b.id, sku_id: skuId, location_id: loc!.id, bin_id: warehouseBinId, qty: 100, bbl: 100 * 0.0645,
    type: "production_in", created_by: adminCtx.userId,
  });
  const custUser = await makeCustomerUser(customerId);
  const db = await asUser(custUser.email);
  custCtx = { db, userId: custUser.id, breweryId: b.id, role: "customer", customerId };
});

describe("portal commands", () => {
  it("derives trusted order fields from the configured fulfillment source and the authenticated customer", async () => {
    const configured = await seedLocation(b.id, { name: "Configured WH" });
    await runCommand("set_portal_fulfillment_source", { locationId: configured.id }, adminCtx);
    const created = await runCommand("portal_create_order", {
      shipToId, poNumber: "PO-1", note: "dock after 9", lines: [{ skuId, qty: 3 }],
    }, custCtx) as { order_id: string };
    const { data: order } = await admin.from("orders")
      .select("brewery_id, customer_id, ship_to_id, from_location_id, sale_channel_id, created_by, kind, status, po_number, note")
      .eq("id", created.order_id).single();
    const { data: line } = await admin.from("order_lines").select("unit_price_cents").eq("order_id", created.order_id).single();
    const { data: event } = await admin.from("order_events").select("actor, event").eq("order_id", created.order_id).eq("event", "created").single();
    expect(order).toMatchObject({
      brewery_id: b.id, customer_id: customerId, ship_to_id: shipToId, from_location_id: configured.id,
      created_by: custCtx.userId, kind: "wholesale", status: "draft", po_number: "PO-1", note: "dock after 9",
    });
    expect(order!.sale_channel_id).not.toBeNull();
    expect(line!.unit_price_cents).toBe(3600);
    expect(event).toEqual({ actor: custCtx.userId, event: "created" });

    await runCommand("portal_update_draft_order", {
      orderId: created.order_id, poNumber: "PO-2", note: "revised", lines: [{ skuId, qty: 4 }],
    }, custCtx);
    const { data: updated } = await admin.from("orders").select("po_number, note, status").eq("id", created.order_id).single();
    expect(updated).toEqual({ po_number: "PO-2", note: "revised", status: "draft" });

    // Omitted PO/note leave the saved values alone; an empty string clears them
    // (the cart sends the fields verbatim on update for exactly this reason).
    await runCommand("portal_update_draft_order", { orderId: created.order_id, lines: [{ skuId, qty: 5 }] }, custCtx);
    const { data: kept } = await admin.from("orders").select("po_number, note").eq("id", created.order_id).single();
    expect(kept).toEqual({ po_number: "PO-2", note: "revised" });
    await runCommand("portal_update_draft_order", { orderId: created.order_id, poNumber: "", note: "", lines: [{ skuId, qty: 5 }] }, custCtx);
    const { data: cleared } = await admin.from("orders").select("po_number, note").eq("id", created.order_id).single();
    expect(cleared).toEqual({ po_number: "", note: "" });

    // The cart's Submit path (app/(portal)/portal/cart.tsx) pushes the current
    // lines through portal_update_draft_order before submitting, so the
    // submitted order must carry the latest quantity, not the created one.
    await runCommand("portal_submit_order", { orderId: created.order_id }, custCtx);
    const { data: after } = await admin.from("orders").select("status").eq("id", created.order_id).single();
    expect(after!.status).toBe("submitted");
    const { data: submittedLines } = await admin.from("order_lines").select("sku_id, qty_ordered").eq("order_id", created.order_id);
    expect(submittedLines).toEqual([{ sku_id: skuId, qty_ordered: 5 }]);
  });

  it("persists, preserves when omitted, and explicitly clears the requested date", async () => {
    const made = await runCommand("portal_create_order", { shipToId, requestedShipDate: "2026-10-01", lines: [{ skuId, qty: 2 }] }, custCtx) as { order_id: string };
    const read = async () => (await runCommand("portal_order", { orderId: made.order_id }, custCtx) as any).order.requested_ship_date;
    expect(await read()).toBe("2026-10-01");
    await runCommand("portal_update_draft_order", { orderId: made.order_id, lines: [{ skuId, qty: 3 }] }, custCtx);
    expect(await read()).toBe("2026-10-01");
    await runCommand("portal_update_draft_order", { orderId: made.order_id, requestedShipDate: "2026-10-02", lines: [{ skuId, qty: 3 }] }, custCtx);
    expect(await read()).toBe("2026-10-02");
    const oldCaller = await adminCtx.db.rpc("update_draft_order", { p_order: made.order_id, p_ship_to: null, p_requested: null, p_po: null, p_note: null, p_lines: [{ sku_id: skuId, qty: 3 }], p_request_id: crypto.randomUUID() });
    expect(oldCaller.error).toBeNull();
    expect(await read()).toBe("2026-10-02");
    await runCommand("portal_update_draft_order", { orderId: made.order_id, requestedShipDate: null, lines: [{ skuId, qty: 3 }] }, custCtx);
    expect(await read()).toBeNull();
  });

  it("recovers lost create and submit responses with exact request replay, without another update", async () => {
    const input = { shipToId, lines: [{ skuId, qty: 2 }] };
    const create = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    await runCommand("portal_create_order", input, custCtx, create); // committed response lost
    const recovered = await runCommand("portal_create_order", input, custCtx, create) as { order_id: string };
    const submit = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    await runCommand("portal_submit_order", { orderId: recovered.order_id }, custCtx, submit); // response lost
    await runCommand("portal_submit_order", { orderId: recovered.order_id }, custCtx, submit);
    const events = await admin.from("order_events").select("event").eq("order_id", recovered.order_id);
    expect(events.data?.map(e => e.event).sort()).toEqual(["created", "submitted"]);
  });

  it("refuses other-customer and cross-tenant draft reads and writes", async () => {
    for (const brewery of [b, await makeBrewery()]) {
      const other = await seedCustomer(brewery.id, { name: `Other-${crypto.randomUUID()}` });
      const location = await seedLocation(brewery.id, { name: `Foreign WH-${crypto.randomUUID()}` });
      const { data: order, error } = await admin.from("orders").insert({ sale_channel_id: other.saleChannelId, from_location_id: location.id, brewery_id: brewery.id, kind: "wholesale", customer_id: other.customerId, ship_to_id: other.shipToId, created_by: adminCtx.userId }).select("id").single();
      expect(error).toBeNull();
      await expect(runCommand("portal_order", { orderId: order!.id }, custCtx)).rejects.toMatchObject({ code: "not_found" });
      await expect(runCommand("portal_update_draft_order", { orderId: order!.id, lines: [{ skuId, qty: 1 }] }, custCtx)).rejects.toThrow();
      await expect(runCommand("portal_submit_order", { orderId: order!.id }, custCtx)).rejects.toThrow();
    }
  });

  it("binds an uncertain request to the original actor at verified dispatch", async () => {
    const secondUser = await makeCustomerUser(customerId);
    const second = { ...custCtx, db: await asUser(secondUser.email), userId: secondUser.id };
    const input = { shipToId, lines: [{ skuId, qty: 1 }], expectedIdentity: { actorId: custCtx.userId, customerId } };
    const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    const made = await runCommand("portal_create_order", input, custCtx, execution) as { order_id: string }; // response lost
    await expect(runCommand("portal_create_order", input, second, execution)).rejects.toThrow(/account changed/);
    const replay = await runCommand("portal_create_order", input, custCtx, execution);
    expect(replay).toEqual(made);
    const madeByB = await admin.from("orders").select("id").eq("created_by", second.userId);
    expect(madeByB.data).toEqual([]);
    // Same request ID under B is still unclaimed after the rejection.
    const other = await runCommand("portal_create_order", { ...input, expectedIdentity: { actorId: second.userId, customerId } }, second, execution) as { order_id: string };
    expect(other.order_id).not.toBe(made.order_id);
    for (const name of ["portal_update_draft_order", "portal_submit_order"]) {
      await expect(runCommand(name, { ...input, orderId: made.order_id }, second)).rejects.toThrow(/account changed/);
    }
  });

  it("exposes only the configured customer-facing fulfillment source", async () => {
    const account = await runCommand("get_portal_account", {}, custCtx) as any;
    expect(account.fulfillmentSource).toMatchObject({ name: "Configured WH" });
    const previous = account.fulfillmentSource.id;
    await admin.from("breweries").update({ portal_fulfillment_location_id: null }).eq("id", b.id);
    try { expect((await runCommand("get_portal_account", {}, custCtx) as any).fulfillmentSource).toBeNull(); }
    finally { await admin.from("breweries").update({ portal_fulfillment_location_id: previous }).eq("id", b.id); }
  });

  it("checks the active customer and brewery inside update/submit even when the actor owns both accounts", async () => {
    for (const brewery of [b, await makeBrewery()]) {
      const target = await seedCustomer(brewery.id, { name: `Owned-${crypto.randomUUID()}` });
      await admin.from("customer_users").insert({ customer_id: target.customerId, user_id: custCtx.userId });
      const targetCtx = { ...custCtx, breweryId: brewery.id, customerId: target.customerId };
      const catalog = await seedCatalog(brewery.id, { product: `Target-${crypto.randomUUID()}`, format: `Target format-${crypto.randomUUID()}` });
      await priceSku(brewery.id, { saleChannelId: target.saleChannelId, brandId: catalog.brandId, formatId: catalog.formatId, cents: 2000 });
      const wh = await seedLocation(brewery.id, { name: `Target WH-${crypto.randomUUID()}` });
      await admin.from("breweries").update({ portal_fulfillment_location_id: wh.id }).eq("id", brewery.id);
      const made = await runCommand("portal_create_order", { shipToId: target.shipToId, lines: [{ skuId: catalog.skuId, qty: 1 }] }, targetCtx) as { order_id: string };
      const update = { orderId: made.order_id, lines: [{ skuId: catalog.skuId, qty: 2 }] };
      const updateExecution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
      const wrongIdentity = { actorId: custCtx.userId, customerId };
      await expect(runCommand("portal_update_draft_order", { ...update, expectedIdentity: wrongIdentity }, custCtx, updateExecution)).rejects.toThrow(/permission denied/);
      const unchanged = await admin.from("order_lines").select("qty_ordered").eq("order_id", made.order_id);
      expect(unchanged.data).toEqual([{ qty_ordered: 1 }]);
      // Reuse the refused ID under the proper scope: rejection must not claim it.
      const changed = await runCommand("portal_update_draft_order", update, targetCtx, updateExecution);
      expect(await runCommand("portal_update_draft_order", update, targetCtx, updateExecution)).toEqual(changed);
      const submitExecution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
      await expect(runCommand("portal_submit_order", { orderId: made.order_id, expectedIdentity: wrongIdentity }, custCtx, submitExecution)).rejects.toThrow(/permission denied/);
      expect((await admin.from("orders").select("status").eq("id", made.order_id).single()).data?.status).toBe("draft");
      const submitted = await runCommand("portal_submit_order", { orderId: made.order_id }, targetCtx, submitExecution);
      expect(await runCommand("portal_submit_order", { orderId: made.order_id }, targetCtx, submitExecution)).toEqual(submitted);
      // A prior update still replays after the order is no longer a draft.
      expect(await runCommand("portal_update_draft_order", update, targetCtx, updateExecution)).toEqual(changed);
      const events = await admin.from("order_events").select("event").eq("order_id", made.order_id);
      expect(events.data?.map(e => e.event).sort()).toEqual(["created", "submitted", "updated"]);
    }
  });

  it("rejects a ship-to that belongs to another customer", async () => {
    const other = await seedCustomer(b.id, { name: "Foreign Bar", saleChannelId });
    await expect(runCommand("portal_create_order", { shipToId: other.shipToId, lines: [{ skuId, qty: 1 }] }, custCtx))
      .rejects.toThrow(/ship-to not found/);
  });

  it("rejects a sku that is not priced on the caller's sale channel or is inactive", async () => {
    const unpriced = await seedCatalog(b.id, { product: "Unpriced", sku: "keg", packageType: "keg", bblPerUnit: 0.5 });
    await expect(runCommand("portal_create_order", { shipToId, lines: [{ skuId: unpriced.skuId, qty: 1 }] }, custCtx))
      .rejects.toThrow(/not active and priced/);
    await admin.from("skus").update({ active: false }).eq("id", skuId);
    await expect(runCommand("portal_create_order", { shipToId, lines: [{ skuId, qty: 1 }] }, custCtx))
      .rejects.toThrow(/not active and priced/);
    await admin.from("skus").update({ active: true }).eq("id", skuId);
  });

  it("update_draft_order enforces the portal invariants at the RPC, not only in zod", async () => {
    // PR #29 review: the DB is the write boundary. A customer calling the RPC
    // directly must not be able to leave a zero-line draft or price an inactive sku.
    const created = await runCommand("portal_create_order", { shipToId, lines: [{ skuId, qty: 1 }] }, custCtx) as { order_id: string };
    const empty = await custCtx.db.rpc("update_draft_order", {
      p_order: created.order_id, p_ship_to: null, p_requested: null, p_po: null, p_note: null,
      p_lines: [], p_request_id: crypto.randomUUID(),
    });
    expect(empty.error?.message).toMatch(/at least one line/);
    const { data: lines } = await admin.from("order_lines").select("id").eq("order_id", created.order_id);
    expect(lines).toHaveLength(1);

    await admin.from("skus").update({ active: false }).eq("id", skuId);
    const inactive = await custCtx.db.rpc("update_draft_order", {
      p_order: created.order_id, p_ship_to: null, p_requested: null, p_po: null, p_note: null,
      p_lines: [{ sku_id: skuId, qty: 2 }], p_request_id: crypto.randomUUID(),
    });
    await admin.from("skus").update({ active: true }).eq("id", skuId);
    expect(inactive.error?.message).toMatch(/not active and priced/);
  });

  it("ignores any client-supplied price: the line price is always the grid price", async () => {
    const created = await runCommand("portal_create_order", {
      shipToId, lines: [{ skuId, qty: 1, unitPriceCents: 1 } as unknown as { skuId: string; qty: number }],
    }, custCtx) as { order_id: string };
    const { data: line } = await admin.from("order_lines").select("unit_price_cents").eq("order_id", created.order_id).single();
    expect(line!.unit_price_cents).toBe(3600);
  });

  it("fails closed when the brewery has no portal fulfillment source", async () => {
    const { data: b2 } = await admin.from("breweries").select("portal_fulfillment_location_id").eq("id", b.id).single();
    await admin.from("breweries").update({ portal_fulfillment_location_id: null }).eq("id", b.id);
    await expect(runCommand("portal_create_order", { shipToId, lines: [{ skuId, qty: 1 }] }, custCtx))
      .rejects.toThrow(/fulfillment source is not configured/);
    await admin.from("breweries").update({ portal_fulfillment_location_id: b2!.portal_fulfillment_location_id }).eq("id", b.id);
  });

  it("portal_catalog returns priced skus with a coarse badge and never raw ATP quantities", async () => {
    const rows = await runCommand("portal_catalog", {}, custCtx) as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThan(0);
    const row = rows.find(r => r.skuId === skuId)!;
    expect(row.unitPriceCents).toBe(3600);
    expect(["in", "low", "out"]).toContain(row.badge);
    expect(Object.keys(row)).not.toContain("qty");
  });

  it("portal_catalog uses only the selected customer's brewery and sale channel", async () => {
    const { data: otherChannel } = await admin.from("sale_channels").select("id").eq("brewery_id", b.id).eq("name", "DTC").single();
    const sameBrewery = await seedCustomer(b.id, { name: "DTC account", saleChannelId: otherChannel!.id });
    await admin.from("customer_users").insert({ customer_id: sameBrewery.customerId, user_id: custCtx.userId });
    const selectedCatalog = await admin.from("skus").select("brand_id, format_id").eq("id", skuId).single();
    await priceSku(b.id, { saleChannelId: otherChannel!.id, brandId: selectedCatalog.data!.brand_id, formatId: selectedCatalog.data!.format_id, cents: 9900 });

    const otherBrewery = await makeBrewery();
    const foreignCatalog = await seedCatalog(otherBrewery.id, { sku: "Foreign SKU" });
    const foreignCustomer = await seedCustomer(otherBrewery.id);
    await admin.from("customer_users").insert({ customer_id: foreignCustomer.customerId, user_id: custCtx.userId });
    await priceSku(otherBrewery.id, { saleChannelId: foreignCustomer.saleChannelId, brandId: foreignCatalog.brandId, formatId: foreignCatalog.formatId, cents: 7700 });

    const rows = await runCommand("portal_catalog", {}, custCtx) as { skuId: string; unitPriceCents: number }[];
    expect(rows.filter(row => row.skuId === skuId)).toEqual([{ skuId, name: "IPA case", product: "IPA", unitPriceCents: 3600, badge: expect.any(String) }]);
    expect(rows.some(row => row.skuId === foreignCatalog.skuId)).toBe(false);
  });

  it("portal_orders lists only the caller's own orders; portal_invoices only their invoices", async () => {
    const otherCustomer = await seedCustomer(b.id, { name: "Other Bar", saleChannelId });
    await admin.from("orders").insert({ brewery_id: b.id, kind: "wholesale", customer_id: otherCustomer.customerId, ship_to_id: otherCustomer.shipToId, created_by: adminCtx.userId });

    const orders = await runCommand("portal_orders", {}, custCtx) as { customer_id: string }[];
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every(o => o.customer_id === customerId)).toBe(true);

    const { data: inv } = await admin.from("invoices").insert({ brewery_id: b.id, customer_id: customerId, kind: "invoice" }).select().single();
    await admin.from("invoices").insert({ brewery_id: b.id, customer_id: otherCustomer.customerId, kind: "invoice" });

    const invoices = await runCommand("portal_invoices", {}, custCtx) as { id: string; customer_id: string }[];
    expect(invoices.some(i => i.id === inv!.id)).toBe(true);
    expect(invoices.every(i => i.customer_id === customerId)).toBe(true);
  });

  it("staff-only commands reject a customer ctx", async () => {
    await expect(runCommand("list_orders", {}, custCtx)).rejects.toThrow(/permission denied/);
  });

  it("replays an identical portal order without re-running it", async () => {
    const input = {
      shipToId,
      poNumber: `replay-${crypto.randomUUID()}`,
      lines: [{ skuId, qty: 1 }],
    };
    const execution = {
      requestId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
    };
    const first = await runCommand("portal_create_order", input, custCtx, execution) as { order_id: string };

    await admin.from("locations").insert({
      id: "00000000-0000-4000-8000-000000000000",
      brewery_id: b.id,
      name: "Earlier warehouse",
      kind: "warehouse",
    });
    const replay = await runCommand("portal_create_order", input, custCtx, execution);

    expect(replay).toEqual(first);
    const orders = await admin.from("orders").select("id").eq("id", first.order_id);
    expect(orders.data).toHaveLength(1);
  });

  it("uses the configured warehouse rather than an arbitrary warehouse", async () => {
    const created = await runCommand("portal_create_order", {
      shipToId, lines: [{ skuId, qty: 1 }],
    }, custCtx) as { order_id: string };
    const { data: brewery } = await admin.from("breweries").select("portal_fulfillment_location_id").eq("id", b.id).single();
    const { data: order } = await admin.from("orders").select("from_location_id").eq("id", created.order_id).single();
    expect(brewery!.portal_fulfillment_location_id).not.toBe(warehouseId);
    expect(order!.from_location_id).toBe(brewery!.portal_fulfillment_location_id);
  });
});

describe("account and invoice reads", () => {
  it("portal_invoice carries the brewery's customer-facing phone so the buyer knows who to call", async () => {
    await runCommand("update_brewery", { name: "Demo", timezone: "America/New_York", customerPhone: "(610) 555-0142", readingDueHours: 24 }, adminCtx);
    const { data: inv } = await admin.from("invoices").insert({ brewery_id: b.id, customer_id: customerId, kind: "invoice" }).select("id").single();
    const got = await runCommand("portal_invoice", { invoiceId: inv!.id }, custCtx) as { brewery: { name: string; customer_phone: string | null } };
    expect(got.brewery.customer_phone).toBe("(610) 555-0142");
  });

  it("get_portal_account returns the caller's customer, ship-tos, membership and deposits only", async () => {
    const acct = await runCommand("get_portal_account", {}, custCtx) as {
      customer: { id: string; name: string }; shipTos: { id: string; label: string; city: string; state: string }[];
      membership: { userId: string }; deposits: { kegSize: string | null; kegsOnDeposit: number; depositCents: number }[];
    };
    expect(acct.customer.id).toBe(customerId);
    expect(acct.shipTos.map((s) => s.id)).toContain(shipToId);
    expect(acct.membership.userId).toBe(custCtx.userId);
    expect(acct.deposits).toEqual([]);
  });

  it("portal_invoice returns the caller's own invoice with lines, and not_found for another customer's", async () => {
    const { data: inv } = await admin.from("invoices").insert({ brewery_id: b.id, customer_id: customerId, kind: "invoice" }).select().single();
    await admin.from("invoice_lines").insert({ brewery_id: b.id, invoice_id: inv!.id, kind: "sku", sku_id: skuId, qty: 2, unit_price_cents: 3600, description: "IPA case" });
    const other = await seedCustomer(b.id, { name: "Not mine", saleChannelId });
    const { data: foreign } = await admin.from("invoices").insert({ brewery_id: b.id, customer_id: other.customerId, kind: "invoice" }).select().single();
    const one = await runCommand("portal_invoice", { invoiceId: inv!.id }, custCtx) as { invoice: { id: string; total_cents: number }; lines: { qty: number }[] };
    expect(one.invoice.id).toBe(inv!.id);
    expect(one.lines.map((l) => Number(l.qty))).toEqual([2]);
    await expect(runCommand("portal_invoice", { invoiceId: foreign!.id }, custCtx)).rejects.toMatchObject({ code: "not_found" });
  });
});
