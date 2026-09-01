// tests/commands-today.test.ts — Today reasons: role/assignment visibility,
// brewery-local due dates, cadence, source versions, safe labels/hrefs, and the
// live-reason gate that keeps unshipped destinations out of both readers.
import { beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { admin, asUser, makeBrewery, makeCustomerUser, makeStaff, makeStaffCtx } from "./helpers";
import { runCommand, type Ctx as CommandCtx } from "@/lib/commands/registry";
import type { TodayItem } from "@/lib/commands/today";
import "@/lib/commands/all";

const sql = new pg.Pool({ connectionString: process.env.POSTGRES_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres" });

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let b: { id: string }, adminCtx: Ctx, sales: Ctx, warehouse: Ctx, brewer: Ctx;
let customerId: string, shipToId: string, whId: string, skuId: string;

async function ins<T = { id: string }>(table: string, row: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.from(table).insert(row).select().single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as T;
}

async function createOrder(requested: string, submit = false, confirm = false) {
  const { data, error } = await adminCtx.db.rpc("create_order", { p_request_id: crypto.randomUUID(),
    p_brewery: b.id, p_kind: "wholesale", p_customer: customerId, p_ship_to: shipToId,
    p_from_location: whId, p_to_location: null, p_requested: requested, p_po: null, p_note: null,
    p_lines: [{ sku_id: skuId, qty: 1 }],
  });
  if (error) throw error;
  const id = (data as { order_id: string }).order_id;
  if (submit) await adminCtx.db.rpc("submit_order", { p_request_id: crypto.randomUUID(), p_order: id });
  if (confirm) await adminCtx.db.rpc("confirm_order", { p_request_id: crypto.randomUUID(), p_order: id });
  return id;
}

const today = (ctx: CommandCtx, now: string) => runCommand("get_today", { now }, ctx) as Promise<TodayItem[]>;

beforeAll(async () => {
  b = await makeBrewery();
  [adminCtx, sales, warehouse, brewer] = await Promise.all([
    makeStaffCtx(b.id, "admin"), makeStaffCtx(b.id, "sales"), makeStaffCtx(b.id, "warehouse"), makeStaffCtx(b.id, "brewer"),
  ]);
  whId = (await ins("locations", { brewery_id: b.id, name: "WH", kind: "warehouse" })).id;
  const product = await ins("products", { brewery_id: b.id, name: "IPA" });
  skuId = (await ins("skus", { brewery_id: b.id, product_id: product.id, name: "IPA 1/2bbl", package_type: "keg", bbl_per_unit: 0.5 })).id;
  const pl = await ins("price_lists", { brewery_id: b.id, name: "std" });
  await ins("price_list_items", { brewery_id: b.id, price_list_id: pl.id, sku_id: skuId, unit_price_cents: 12000 });
  customerId = (await ins("customers", { brewery_id: b.id, name: "Secret Bar LLC", type: "retailer", state: "PA", price_list_id: pl.id })).id;
  shipToId = (await ins("ship_tos", { brewery_id: b.id, customer_id: customerId, label: "m", address1: "1", city: "P", state: "PA", zip: "19100" })).id;
  await ins("inventory_movements", { brewery_id: b.id, sku_id: skuId, location_id: whId, qty: 100, type: "opening_balance", created_by: adminCtx.userId });
});

describe("get_today (registered reader)", () => {
  it("shows submitted orders to sales/admin and picks due to warehouse/admin with brewery-local due dates", async () => {
    const submitted = await createOrder("2026-09-05", true);
    const confirmed = await createOrder("2026-09-05", true, true);
    const noon = "2026-09-05T12:00:00Z";

    const forSales = await today(sales, noon);
    expect(forSales.map((i) => [i.reason, i.subjectId])).toEqual([["submitted_order", submitted]]);
    const forWarehouse = await today(warehouse, noon);
    expect(forWarehouse.map((i) => [i.reason, i.subjectId])).toEqual([["pick_due", confirmed]]);
    expect((await today(adminCtx, noon)).map((i) => i.reason).sort()).toEqual(["pick_due", "submitted_order"]);
    expect(await today(brewer, noon)).toEqual([]);

    // America/New_York: 2026-09-05 begins at 04:00Z. Not due at 03:00Z, due at 05:00Z.
    expect((await today(warehouse, "2026-09-05T03:00:00Z")).map((i) => i.reason)).toEqual([]);
    expect((await today(warehouse, "2026-09-05T05:00:00Z")).map((i) => i.reason)).toEqual(["pick_due"]);
    expect(forWarehouse[0].dueAt).toBe("2026-09-05T04:00:00+00:00");
  });

  it("uses safe labels and MGR hrefs, never customer names", async () => {
    const id = await createOrder("2026-09-06", true);
    const item = (await today(sales, "2026-09-06T12:00:00Z")).find((i) => i.subjectId === id)!;
    expect(item.safeLabel).toMatch(/^ORD-\d{4,}$/);
    expect(item.href).toBe(`/orders/${id}`);
    expect(item.subjectType).toBe("order");
    expect(item.recipientRoles).toEqual(["admin", "sales"]);
    expect(item.assignedUserId).toBeNull();
    expect(JSON.stringify(item)).not.toMatch(/Secret Bar/);
  });

  it("changes the source version when relevant state changes", async () => {
    const id = await createOrder("2026-09-07", true);
    const before = (await today(sales, "2026-09-07T12:00:00Z")).find((i) => i.subjectId === id)!.sourceVersion;
    await admin.from("orders").update({ requested_ship_date: "2026-09-08" }).eq("id", id);
    const after = (await today(sales, "2026-09-08T12:00:00Z")).find((i) => i.subjectId === id)!.sourceVersion;
    expect(after).not.toBe(before);
    expect(before).toMatch(/^[0-9a-f]{32}$/);
  });

  it("rejects customers", async () => {
    const customerUser = await makeCustomerUser(customerId);
    const ctx = { db: await asUser(customerUser.email), userId: customerUser.id, breweryId: b.id, role: "customer" as const, customerId };
    await expect(today(ctx, "2026-09-05T12:00:00Z")).rejects.toThrow(/permission/i);
  });

  it("does not leak another brewery's work", async () => {
    const other = await makeStaffCtx((await makeBrewery()).id, "admin");
    expect(await today(other, "2026-09-05T12:00:00Z")).toEqual([]);
  });
});

describe("today candidates (shared projection) and internal scan", () => {
  it("derives delivery-next and fermentation-overdue rules once, honouring cadence", async () => {
    const driver = await makeStaff(b.id, "warehouse");
    const orderA = await createOrder("2026-09-05", true, true);
    const orderB = await createOrder("2026-09-05", true, true);
    const shipA = await ins("shipments", { brewery_id: b.id, order_id: orderA, created_by: adminCtx.userId });
    const shipB = await ins("shipments", { brewery_id: b.id, order_id: orderB, created_by: adminCtx.userId });
    const route = await ins("routes", { brewery_id: b.id, name: "Route A", delivery_date: "2026-09-05", driver_user_id: driver.id });
    await ins("deliveries", { brewery_id: b.id, route_id: route.id, shipment_id: shipA.id, stop_no: 1, delivered_at: "2026-09-05T13:00:00Z" });
    const stop2 = await ins("deliveries", { brewery_id: b.id, route_id: route.id, shipment_id: shipB.id, stop_no: 2 });

    const vessel = await ins("vessels", { brewery_id: b.id, name: "FV2", kind: "fermenter", capacity_bbl: 15 });
    const product = await ins("products", { brewery_id: b.id, name: "Hazy" });
    const batch = await ins("batches", { brewery_id: b.id, product_id: product.id, planned_on: "2026-09-01", planned_bbl: 15, created_by: adminCtx.userId });
    const occupancy = await ins("vessel_occupancies", { brewery_id: b.id, vessel_id: vessel.id, batch_id: batch.id, started_at: "2026-09-04T00:00:00Z" });
    await ins("fermentation_readings", { brewery_id: b.id, occupancy_id: occupancy.id, at: "2026-09-04T06:00:00Z", created_by: adminCtx.userId });

    const rows = async () => (await sql.query(
      "select reason, subject_id, due_at, href, recipient_roles, assigned_user_id from private.today_candidates where brewery_id = $1 and reason in ('delivery_next','fermentation_reading_overdue')",
      [b.id],
    )).rows;
    const candidates = await rows();
    expect(candidates.find((r) => r.reason === "delivery_next")).toMatchObject({
      subject_id: stop2.id, href: `/work/deliveries/${stop2.id}`, recipient_roles: ["admin", "warehouse"], assigned_user_id: driver.id,
    });
    const overdue = candidates.find((r) => r.reason === "fermentation_reading_overdue")!;
    expect(overdue).toMatchObject({ subject_id: occupancy.id, href: `/beer/cellar/${occupancy.id}/reading`, recipient_roles: ["admin", "brewer"] });
    expect(new Date(overdue.due_at).toISOString()).toBe("2026-09-05T06:00:00.000Z"); // last reading + 24 h

    await admin.from("breweries").update({ fermentation_reading_due_hours: 48 }).eq("id", b.id);
    expect(new Date((await rows()).find((r) => r.reason === "fermentation_reading_overdue")!.due_at).toISOString()).toBe("2026-09-06T06:00:00.000Z");
    await admin.from("breweries").update({ fermentation_reading_due_hours: 24 }).eq("id", b.id);
  });

  it("gates both readers to reasons whose MGR destinations exist", async () => {
    const live = (await sql.query("select public.today_live_reasons() as r")).rows[0].r;
    expect(live).toEqual(["submitted_order", "pick_due"]);
    const scanned = (await sql.query("select distinct reason from public.scan_chat_today_candidates($1, $2)", [b.id, "2026-09-10T12:00:00Z"])).rows.map((r) => r.reason).sort();
    expect(scanned).toEqual(["pick_due", "submitted_order"]);
    const reasons = new Set((await today(adminCtx, "2026-09-10T12:00:00Z")).map((i) => i.reason));
    expect([...reasons].sort()).toEqual(["pick_due", "submitted_order"]);
  });

  it("denies the internal scan to authenticated users", async () => {
    const { error } = await adminCtx.db.rpc("scan_chat_today_candidates", { p_brewery_id: b.id, p_now: "2026-09-10T12:00:00Z" });
    expect(error?.message).toMatch(/permission denied|not find the function/i);
  });
});
