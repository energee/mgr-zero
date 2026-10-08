// tests/rls-portal-columns.test.ts — #754: a portal customer reads only buyer
// columns of invoices, order_events, shipments and deliveries. Staff and
// customers share the `authenticated` table grant, so the customer path is a
// portal_* projection with no customer policy on the base table (the
// portal_brewery pattern, iron rule 3).
import { describe, it, expect, beforeAll } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx, makeCustomerUser, asUser, seedCustomer, seedLocation } from "./helpers";
import { rawDatabase } from "./raw-database";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

const HIDDEN_INVOICE_COLUMNS = ["qbo_sync_error", "qbo_sync_token", "qbo_idempotency_key", "written_off_reason", "written_off_by"];

let customerDb: Awaited<ReturnType<typeof asUser>>;
let staffDb: Awaited<ReturnType<typeof asUser>>;
let invoiceId: string, orderId: string, shipmentId: string, deliveryId: string, foreignInvoiceId: string;
let custCtx: { db: typeof customerDb; userId: string; breweryId: string; role: "customer"; customerId: string };

beforeAll(async () => {
  const b = await makeBrewery();
  const staff = await makeStaffCtx(b.id, "admin");
  staffDb = staff.db;
  const mine = await seedCustomer(b.id, { name: "Buyer" });
  const other = await seedCustomer(b.id, { name: "Other buyer", saleChannelId: mine.saleChannelId });
  const wh = await seedLocation(b.id);
  const order = await ins("orders", {
    brewery_id: b.id, kind: "wholesale", customer_id: mine.customerId, ship_to_id: mine.shipToId,
    sale_channel_id: mine.saleChannelId, from_location_id: wh.id, created_by: staff.userId, status: "shipped",
  });
  orderId = order.id;
  await ins("order_events", { brewery_id: b.id, order_id: orderId, actor: staff.userId, event: "shipped", payload: { reason: "internal short-pick note" } });
  shipmentId = (await ins("shipments", { brewery_id: b.id, order_id: orderId, created_by: staff.userId, carrier: "Truck" })).id;
  const route = await ins("routes", { brewery_id: b.id, delivery_date: "2026-10-08" });
  deliveryId = (await ins("deliveries", { brewery_id: b.id, route_id: route.id, shipment_id: shipmentId, stop_no: 1, note: "driver-only note" })).id;
  invoiceId = (await ins("invoices", { brewery_id: b.id, customer_id: mine.customerId, shipment_id: shipmentId, kind: "invoice" })).id;
  const { error } = await admin.from("invoices").update({
    qbo_sync_error: "QBO 400: internal stack", written_off_at: new Date().toISOString(), written_off_reason: "bad debt", written_off_by: staff.userId,
  }).eq("id", invoiceId);
  if (error) throw error;
  foreignInvoiceId = (await ins("invoices", { brewery_id: b.id, customer_id: other.customerId, kind: "invoice" })).id;
  const user = await makeCustomerUser(mine.customerId);
  customerDb = await asUser(user.email);
  custCtx = { db: customerDb, userId: user.id, breweryId: b.id, role: "customer", customerId: mine.customerId };
});

describe("portal customers cannot read internal columns (#754)", () => {
  it("returns no base-table rows to a customer, so no column of them leaks", async () => {
    for (const [table, key, id] of [["invoices", "id", invoiceId], ["order_events", "order_id", orderId], ["shipments", "id", shipmentId], ["deliveries", "id", deliveryId]] as const) {
      const { data, error } = await rawDatabase(customerDb).from(table).select("*").eq(key, id);
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
  });

  it("exposes buyer columns through the portal projections, scoped to the caller", async () => {
    const inv = await customerDb.from("portal_invoices").select("*").eq("id", invoiceId).single();
    expect(inv.error).toBeNull();
    for (const hidden of HIDDEN_INVOICE_COLUMNS) {
      expect(inv.data, hidden).not.toHaveProperty(hidden);
    }
    const foreign = await customerDb.from("portal_invoices").select("id").eq("id", foreignInvoiceId);
    expect(foreign.data).toEqual([]);
    const events = await customerDb.from("portal_order_events").select("*").eq("order_id", orderId);
    expect(events.data!.map((e) => e.event)).toEqual(["shipped"]);
    expect(events.data![0]).not.toHaveProperty("payload");
    expect(events.data![0]).not.toHaveProperty("actor");
    const ship = await customerDb.from("portal_shipments").select("*").eq("id", shipmentId).single();
    expect(ship.data).not.toHaveProperty("created_by");
  });

  it("portal commands return no internal columns", async () => {
    const { rows } = await runCommand("portal_invoices", {}, custCtx) as { rows: Record<string, unknown>[] };
    const row = rows.find((r) => r.id === invoiceId)!;
    expect(row).toBeDefined();
    for (const hidden of HIDDEN_INVOICE_COLUMNS) {
      expect(row, hidden).not.toHaveProperty(hidden);
    }
    const detail = await runCommand("portal_order", { orderId }, custCtx) as { events: Record<string, unknown>[]; shipment: { id: string; invoices: { id: string }[] } };
    expect(detail.events.map((e) => e.event)).toEqual(["shipped"]);
    expect(detail.events[0]).not.toHaveProperty("payload");
    expect(detail.events[0]).not.toHaveProperty("actor");
    expect(detail.shipment.id).toBe(shipmentId);
    expect(detail.shipment.invoices.map((i) => i.id)).toEqual([invoiceId]);
  });

  it("staff still read every column of the base tables", async () => {
    const inv = await staffDb.from("invoices").select("qbo_sync_error, written_off_reason").eq("id", invoiceId).single();
    expect(inv.data).toEqual({ qbo_sync_error: "QBO 400: internal stack", written_off_reason: "bad debt" });
    const ev = await staffDb.from("order_events").select("payload").eq("order_id", orderId).single();
    expect(ev.data!.payload).toEqual({ reason: "internal short-pick note" });
    const del = await staffDb.from("deliveries").select("note").eq("id", deliveryId).single();
    expect(del.data!.note).toBe("driver-only note");
  });
});
