// tests/commands-today.test.ts — Today reasons: role/assignment visibility,
// brewery-local due dates, cadence, source versions, safe labels/hrefs, and the
// live-reason gate that keeps unshipped destinations out of both readers.
import { beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { admin, asUser, channelId, DB, ins, makeBrewery, makeCustomerUser, makeStaff, makeStaffCtx, priceSku } from "./helpers";
import { runCommand, type Ctx as CommandCtx } from "@/lib/commands/registry";
import type { TodayItem } from "@/lib/commands/today";
import { docNo } from "@/lib/mgr/doc-no";
import type { WorkRow } from "@/lib/commands/landings";
import "@/lib/commands/all";

const sql = new pg.Pool({ connectionString: DB });

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let b: { id: string }, adminCtx: Ctx, sales: Ctx, warehouse: Ctx, brewer: Ctx;
let customerId: string, shipToId: string, whId: string, whBinId: string, skuId: string;

async function createOrder(requested: string | null, submit = false, confirm = false) {
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
  whId = (await ins("locations", { brewery_id: b.id, name: "WH", uses: ["warehouse"] })).id;
  whBinId = (await ins("bins", { brewery_id: b.id, location_id: whId, name: "Cold" })).id;
  const brand = await ins("brands", { brewery_id: b.id, name: "IPA" });
  const format = await ins("formats", { brewery_id: b.id, name: "1/2 bbl keg", basis: "packaged", package_type: "keg", keg_size: "half_bbl", bbl_per_unit: 0.5 });
  skuId = (await ins("skus", { brewery_id: b.id, brand_id: brand.id, format_id: format.id, name: "IPA 1/2bbl" })).id;
  customerId = (await ins("customers", { brewery_id: b.id, name: "Secret Bar LLC", type: "retailer", state: "PA", sale_channel_id: await channelId(b.id, "Wholesale") })).id;
  await priceSku(b.id, { saleChannelId: await channelId(b.id, "Wholesale"), brandId: brand.id, formatId: format.id, cents: 12000 });
  shipToId = (await ins("ship_tos", { brewery_id: b.id, customer_id: customerId, label: "m", address1: "1", city: "P", state: "PA", zip: "19100" })).id;
  await ins("inventory_movements", { brewery_id: b.id, sku_id: skuId, location_id: whId, bin_id: whBinId, qty: 100, type: "opening_balance", created_by: adminCtx.userId });
});

describe("get_today (registered reader)", () => {
  it("shows submitted orders to sales/admin and picks due to warehouse/admin with brewery-local due dates", async () => {
    const submitted = await createOrder("2026-09-05", true);
    const confirmed = await createOrder("2026-09-05", true, true);
    const noon = "2026-09-05T12:00:00Z";

    const forSales = await today(sales, noon);
    expect(forSales.map((i) => [i.reason, i.subjectId])).toEqual([["submitted_order", submitted]]);
    expect(forSales[0].detail).toBe("submitted · ships Sep 5, 2026");
    const forWarehouse = await today(warehouse, noon);
    expect(forWarehouse.map((i) => [i.reason, i.subjectId])).toEqual([["pick_due", confirmed]]);
    expect((await today(adminCtx, noon)).map((i) => i.reason).sort()).toEqual(["pick_due", "submitted_order"]);
    expect(await today(brewer, noon)).toEqual([]);

    // America/New_York: 2026-09-05 begins at 04:00Z. Not due at 03:00Z, due at 05:00Z.
    expect((await today(warehouse, "2026-09-05T03:00:00Z")).map((i) => i.reason)).toEqual([]);
    expect((await today(warehouse, "2026-09-05T05:00:00Z")).map((i) => i.reason)).toEqual(["pick_due"]);
    expect(forWarehouse[0].dueAt).toBe("2026-09-05T04:00:00+00:00");
  });

  it("shows both sales and warehouse work once to a member holding both roles", async () => {
    const combined = await makeStaffCtx(b.id, ["sales", "warehouse"]);
    const submitted = await createOrder("2026-09-05", true);
    const confirmed = await createOrder("2026-09-05", true, true);
    const ownRows = (await today(combined, "2026-09-05T12:00:00Z"))
      .filter((item) => item.subjectId === submitted || item.subjectId === confirmed);
    expect(ownRows.map((item) => [item.reason, item.subjectId]).sort())
      .toEqual([["pick_due", confirmed], ["submitted_order", submitted]]);
  });

  it("keeps an undated confirmed order always pick due, after dated work (#820)", async () => {
    const dated = await createOrder("2026-09-05", true, true);
    const id = await createOrder(null, true, true);
    const item = (await today(warehouse, "2000-01-01T00:00:00Z")).find((i) => i.subjectId === id);
    expect(item).toMatchObject({
      reason: "pick_due", subjectType: "order", subjectId: id, dueAt: null,
      detail: "pick due · no ship date", href: `/orders/${id}/pick`,
      recipientRoles: ["admin", "warehouse"],
    });
    expect((await today(adminCtx, "2000-01-01T00:00:00Z")).find((i) => i.subjectId === id)).toEqual(item);
    for (const ctx of [sales, brewer]) {
      expect((await today(ctx, "2026-09-05T12:00:00Z")).find((i) => i.subjectId === id)).toBeUndefined();
    }
    const picks = (await today(warehouse, "2026-09-05T12:00:00Z")).filter((i) => i.reason === "pick_due");
    expect(picks.find((i) => i.subjectId === dated)?.dueAt).toBe("2026-09-05T04:00:00+00:00");
    expect(picks.findIndex((i) => i.subjectId === dated)).toBeLessThan(picks.findIndex((i) => i.subjectId === id));
    expect(picks.at(-1)?.subjectId).toBe(id);
    const work = await runCommand("list_work", {}, warehouse) as WorkRow[];
    expect(work.find((r) => r.href === `/orders/${id}/pick`)).toMatchObject({
      kind: "orders", verb: "Pick", dueAt: null, detail: "pick due · no ship date",
    });
  });

  it("keeps customer names out of safe labels and chat; Today alone gets the name (#1512)", async () => {
    const id = await createOrder("2026-09-06", true);
    const item = (await today(sales, "2026-09-06T12:00:00Z")).find((i) => i.subjectId === id)!;
    expect(item.safeLabel).toMatch(/^ORD-\d{4,}$/);
    expect(item.customerName).toBe("Secret Bar LLC");
    expect(JSON.stringify({ ...item, customerName: null })).not.toMatch(/Secret Bar/);
    // The chat scan feeds Slack payloads: it never carries the customer.
    const scanned = (await sql.query("select safe_label, customer_name from public.scan_chat_today_candidates($1, $2) where subject_id = $3", [b.id, "2026-09-06T12:00:00Z", id])).rows;
    expect(scanned).toEqual([{ safe_label: item.safeLabel, customer_name: null }]);
    // Today opens the page that does the work: Review and confirm (#1503).
    expect(item.href).toBe(`/orders/${id}/confirm`);
    expect(item.subjectType).toBe("order");
    expect(item.recipientRoles).toEqual(["admin", "sales"]);
    expect(item.assignedUserId).toBeNull();
  });

  it("labels order numbers past four digits in full, like docNo (#474)", async () => {
    // Postgres lpad truncates: lpad('12345', 4, '0') is '1234', another order's label.
    await sql.query(
      "insert into brewery_counters (brewery_id, key, next) values ($1, 'order', 12345) on conflict (brewery_id, key) do update set next = 12345",
      [b.id],
    );
    const id = await createOrder("2026-09-06", true);
    const item = (await today(sales, "2026-09-06T12:00:00Z")).find((i) => i.subjectId === id)!;
    expect(item.safeLabel).toBe(docNo("ORD", 12345, ""));
    expect(item.safeLabel).toBe("ORD-12345");
  });

  it("changes the source version when relevant state changes", async () => {
    const id = await createOrder("2026-09-07", true);
    const before = (await today(sales, "2026-09-07T12:00:00Z")).find((i) => i.subjectId === id)!.sourceVersion;
    await admin.from("orders").update({ requested_ship_date: "2026-09-08" }).eq("id", id);
    const after = (await today(sales, "2026-09-08T12:00:00Z")).find((i) => i.subjectId === id)!.sourceVersion;
    expect(after).not.toBe(before);
    expect(before).toMatch(/^[0-9a-f]{32}$/);
  });

  it("shows restock_due to warehouse when needs_restock is set, including cancelled orders", async () => {
    const id = await createOrder("2026-09-07", true, true);
    const { data: line } = await admin.from("order_lines").select("id").eq("order_id", id).single();
    await adminCtx.db.rpc("record_pick", {
      p_order: id, p_picks: [{ line_id: line!.id, qty_picked: 1 }], p_request_id: crypto.randomUUID(),
    });
    await adminCtx.db.rpc("adjust_order_lines", {
      p_order: id, p_lines: [{ sku_id: skuId, qty: 1 }], p_reason: "cut", p_request_id: crypto.randomUUID(),
    });
    // adjust after pick sets needs_restock; cancel must keep it
    await adminCtx.db.rpc("cancel_order", { p_order: id, p_reason: "customer dropped", p_request_id: crypto.randomUUID() });
    const rows = await today(warehouse, "2026-09-07T12:00:00Z");
    const restock = rows.find((i) => i.reason === "restock_due" && i.subjectId === id);
    expect(restock).toBeDefined();
    expect(restock!.href).toBe(`/orders/${id}/restock`);
    expect(restock!.recipientRoles).toEqual(["admin", "warehouse"]);
    expect(await today(sales, "2026-09-07T12:00:00Z")).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: "restock_due", subjectId: id })]),
    );
  });

  it("a dated picked order raised after pick shows pick_due and no restock_due (#811)", async () => {
    const id = await createOrder("2026-09-07", true, true);
    const { data: line } = await admin.from("order_lines").select("id").eq("order_id", id).single();
    await adminCtx.db.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line!.id, qty_picked: 1 }], p_request_id: crypto.randomUUID() });
    const adjusted = await adminCtx.db.rpc("adjust_order_lines", { p_order: id, p_lines: [{ sku_id: skuId, qty: 3 }], p_reason: "raise", p_request_id: crypto.randomUUID() });
    expect(adjusted.error).toBeNull();
    const rows = (await today(warehouse, "2026-09-07T12:00:00Z")).filter((i) => i.subjectId === id);
    expect(rows.map((i) => i.reason)).toEqual(["pick_due"]);
  });

  it("marks a pick row changed after pick until the changed lines are counted again (#811)", async () => {
    const plain = await createOrder("2026-09-07", true, true);
    const id = await createOrder("2026-09-07", true, true);
    const { data: line } = await admin.from("order_lines").select("id").eq("order_id", id).single();
    const pick = (qty: number) => adminCtx.db.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line!.id, qty_picked: qty }], p_request_id: crypto.randomUUID() });
    await pick(1);
    const adjusted = await adminCtx.db.rpc("adjust_order_lines", { p_order: id, p_lines: [{ sku_id: skuId, qty: 3 }], p_reason: "raise", p_request_id: crypto.randomUUID() });
    expect(adjusted.error).toBeNull();
    const rows = async () => (await today(warehouse, "2026-09-07T12:00:00Z")).filter((i) => i.reason === "pick_due");
    expect((await rows()).find((i) => i.subjectId === id)?.detail).toBe("pick due · ships Sep 7, 2026 · changed after pick");
    expect((await rows()).find((i) => i.subjectId === plain)?.detail).toBe("pick due · ships Sep 7, 2026");
    expect((await pick(3)).error).toBeNull();
    expect((await rows()).find((i) => i.subjectId === id)).toBeUndefined();
  });

  it("keeps a picked order on pick_due while any line is still owed", async () => {
    const id = await createOrder("2026-09-07", true, true);
    const { data: line } = await admin.from("order_lines").select("id").eq("order_id", id).single();
    await adminCtx.db.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line!.id, qty_picked: 0 }], p_request_id: crypto.randomUUID() });
    const owed = (await today(warehouse, "2026-09-07T12:00:00Z")).find((i) => i.reason === "pick_due" && i.subjectId === id);
    expect(owed).toBeDefined();
    await adminCtx.db.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line!.id, qty_picked: 1 }], p_request_id: crypto.randomUUID() });
    expect((await today(warehouse, "2026-09-07T12:00:00Z")).find((i) => i.reason === "pick_due" && i.subjectId === id)).toBeUndefined();
  });

  it("moves a fully picked order from pick_due to ship_due until it ships (#1514)", async () => {
    const id = await createOrder("2026-09-07", true, true);
    const { data: line } = await admin.from("order_lines").select("id").eq("order_id", id).single();
    await adminCtx.db.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line!.id, qty_picked: 1 }], p_request_id: crypto.randomUUID() });
    const rows = async (ctx: CommandCtx) => (await today(ctx, "2026-09-07T12:00:00Z")).filter((i) => i.subjectId === id);
    expect(await rows(warehouse)).toEqual([expect.objectContaining({
      reason: "ship_due", href: `/orders/${id}/ship`, detail: "ship due · ships Sep 7, 2026", recipientRoles: ["admin", "warehouse"],
    })]);
    expect(await rows(sales)).toEqual([]);
    await sql.query("update orders set status = 'shipped' where id = $1", [id]);
    expect(await rows(warehouse)).toEqual([]);
  });

  it("rejects customers", async () => {
    const customerUser = await makeCustomerUser(customerId);
    const ctx = { db: await asUser(customerUser.email), userId: customerUser.id, breweryId: b.id, roles: ["customer" as const], customerId };
    await expect(today(ctx, "2026-09-05T12:00:00Z")).rejects.toThrow(/permission/i);
  });

  it("does not leak another brewery's work", async () => {
    const other = await makeStaffCtx((await makeBrewery()).id, "admin");
    expect(await today(other, "2026-09-05T12:00:00Z")).toEqual([]);
  });
});

describe("today candidates (shared projection) and internal scan", () => {
  // An open occupancy whose last reading is older than the brewery cadence, so
  // today_candidates emits fermentation_reading_overdue for it. Each test that
  // asserts on one builds its own, so either runs alone.
  async function overdueOccupancy(vesselName: string) {
    const vessel = await ins("vessels", { brewery_id: b.id, name: vesselName, kind: "fermenter", capacity_bbl: 15 });
    const brand = await ins("brands", { brewery_id: b.id, name: `Hazy ${vesselName}` });
    const batch = await ins("batches", { brewery_id: b.id, intended_brand_id: brand.id, planned_on: "2026-09-01", planned_bbl: 15, created_by: adminCtx.userId });
    const occupancy = await ins("vessel_occupancies", { brewery_id: b.id, vessel_id: vessel.id, batch_id: batch.id, started_at: "2026-09-04T00:00:00Z" });
    await ins("fermentation_readings", { brewery_id: b.id, batch_id: batch.id, occupancy_id: occupancy.id, at: "2026-09-04T06:00:00Z", created_by: adminCtx.userId });
    return occupancy.id;
  }

  it("derives delivery-next and fermentation-overdue rules once, honouring cadence", async () => {
    const driver = await makeStaff(b.id, "warehouse");
    const orderA = await createOrder("2026-09-05", true, true);
    const orderB = await createOrder("2026-09-05", true, true);
    const shipA = await ins("shipments", { brewery_id: b.id, order_id: orderA, created_by: adminCtx.userId });
    const shipB = await ins("shipments", { brewery_id: b.id, order_id: orderB, created_by: adminCtx.userId });
    const route = await ins("routes", { brewery_id: b.id, name: "Route A", delivery_date: "2026-09-05", driver_user_id: driver.id, departed_at: "2026-09-05T12:00:00Z" });
    await ins("deliveries", { brewery_id: b.id, route_id: route.id, shipment_id: shipA.id, stop_no: 1, delivered_at: "2026-09-05T13:00:00Z" });
    const stop2 = await ins("deliveries", { brewery_id: b.id, route_id: route.id, shipment_id: shipB.id, stop_no: 2 });

    const occupancyId = await overdueOccupancy("FV2");

    const rows = async () => (await sql.query(
      "select reason, subject_id, due_at, href, recipient_roles, assigned_user_id from private.today_candidates where brewery_id = $1 and (reason = 'delivery_next' or subject_id = $2)",
      [b.id, occupancyId],
    )).rows;
    const candidates = await rows();
    expect(candidates.find((r) => r.reason === "delivery_next")).toMatchObject({
      subject_id: stop2.id, href: `/work/deliveries/${stop2.id}`, recipient_roles: ["admin", "warehouse"], assigned_user_id: driver.id,
    });
    const overdue = candidates.find((r) => r.reason === "fermentation_reading_overdue")!;
    expect(overdue).toMatchObject({ subject_id: occupancyId, href: `/cellar/${occupancyId}/reading`, recipient_roles: ["admin", "brewer"] });
    expect(new Date(overdue.due_at).toISOString()).toBe("2026-09-05T06:00:00.000Z"); // last reading + 24 h

    await admin.from("breweries").update({ fermentation_reading_due_hours: 48 }).eq("id", b.id);
    expect(new Date((await rows()).find((r) => r.reason === "fermentation_reading_overdue")!.due_at).toISOString()).toBe("2026-09-06T06:00:00.000Z");
    await admin.from("breweries").update({ fermentation_reading_due_hours: 24 }).eq("id", b.id);
  });

  it("gates both readers to reasons whose MGR destinations exist", async () => {
    // Own every fixture the assertions below name — one order per live reason
    // plus an overdue vessel — so this test runs alone as well as in file order.
    const occupancyId = await overdueOccupancy("FV-GATE");
    await createOrder("2026-09-05", true);                    // submitted_order
    await createOrder("2026-09-05", true, true);              // pick_due
    const restocked = await createOrder("2026-09-05", true, true);
    const { data: line } = await admin.from("order_lines").select("id").eq("order_id", restocked).single();
    await adminCtx.db.rpc("record_pick", { p_order: restocked, p_picks: [{ line_id: line!.id, qty_picked: 1 }], p_request_id: crypto.randomUUID() });
    await adminCtx.db.rpc("adjust_order_lines", { p_order: restocked, p_lines: [{ sku_id: skuId, qty: 1 }], p_reason: "cut", p_request_id: crypto.randomUUID() });  // restock_due
    const picked = await createOrder("2026-09-05", true, true);
    const { data: pickedLine } = await admin.from("order_lines").select("id").eq("order_id", picked).single();
    await adminCtx.db.rpc("record_pick", { p_order: picked, p_picks: [{ line_id: pickedLine!.id, qty_picked: 1 }], p_request_id: crypto.randomUUID() });  // ship_due
    const shipped = await createOrder("2026-09-05", true, true);
    const ship = await ins("shipments", { brewery_id: b.id, order_id: shipped, created_by: adminCtx.userId });
    const gateRoute = await ins("routes", { brewery_id: b.id, name: "Gate", delivery_date: "2026-09-05", departed_at: "2026-09-05T12:00:00Z" });
    await ins("deliveries", { brewery_id: b.id, route_id: gateRoute.id, shipment_id: ship.id, stop_no: 1 });  // delivery_next

    const live = (await sql.query("select public.today_live_reasons() as r")).rows[0].r;
    expect(live).toEqual(["submitted_order", "pick_due", "restock_due", "delivery_next", "fermentation_reading_overdue", "invoice_question"]);
    const scanned = (await sql.query("select distinct reason from public.scan_chat_today_candidates($1, $2)", [b.id, "2026-09-10T12:00:00Z"])).rows.map((r) => r.reason).sort();
    expect(scanned).toEqual(["delivery_next", "fermentation_reading_overdue", "pick_due", "restock_due", "submitted_order"]);
    const reasons = new Set((await today(adminCtx, "2026-09-10T12:00:00Z")).map((i) => i.reason));
    // ship_due is Today-only, like refused_return: not a live reason, so chat never scans it (#1514).
    expect([...reasons].sort()).toEqual(["delivery_next", "fermentation_reading_overdue", "pick_due", "restock_due", "ship_due", "submitted_order"]);

    // The cellar reading page ships, so a brewer now sees the overdue vessel.
    // arrayContaining: other tests may leave further overdue vessels behind.
    const forBrewer = await today(brewer, "2026-09-10T12:00:00Z");
    expect(forBrewer.every((i) => i.reason === "fermentation_reading_overdue")).toBe(true);
    expect(forBrewer).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "fermentation_reading_overdue", subjectId: occupancyId, href: `/cellar/${occupancyId}/reading` }),
    ]));
  });

  it("denies the internal scan to authenticated users", async () => {
    const { error } = await adminCtx.db.rpc("scan_chat_today_candidates", { p_brewery_id: b.id, p_now: "2026-09-10T12:00:00Z" });
    expect(error?.message).toMatch(/permission denied|not find the function/i);
  });
});

it("reads restock and refused-return work without scanning a 9,000-order history (#1645)", async () => {
  const client = await sql.connect();
  try {
    await client.query("begin");
    // Two years of closed deliveries, with only two restocks and one refusal.
    // Roll back the bulk fixture so other suites do not inherit its history.
    await client.query(`create temp table today_history on commit drop as
      select n, gen_random_uuid() order_id, gen_random_uuid() shipment_id,
        gen_random_uuid() delivery_id
      from generate_series(1, 9000) n`);
    await client.query(`insert into public.orders
      (id, brewery_id, status, customer_id, ship_to_id, from_location_id,
       sale_channel_id, created_by, needs_restock, created_at, shipped_at)
      select order_id, $1, case when n = 1 then 'cancelled'::public.order_status
        else 'shipped'::public.order_status end, $2, $3, $4,
        (select sale_channel_id from public.customers where id = $2), $5, n <= 2,
        now() - (n % 730) * interval '1 day', now() - (n % 730) * interval '1 day'
      from today_history`, [b.id, customerId, shipToId, whId, adminCtx.userId]);
    await client.query(`insert into public.order_lines
      (brewery_id, order_id, sku_id, qty_ordered, qty_picked, qty_shipped,
       unit_price_cents, qty_refused)
      select $1, order_id, $2, 2, 2, 2, 12000, case when n = 3 then 1 else 0 end
      from today_history`, [b.id, skuId]);
    await client.query(`insert into public.shipments
      (id, brewery_id, order_id, created_by, invoice_timing)
      select shipment_id, $1, order_id, $2, 'on_delivery' from today_history`,
    [b.id, adminCtx.userId]);
    const route = await client.query(`insert into public.routes
      (brewery_id, name, delivery_date, departed_at, returned_at)
      values ($1, 'Completed history', current_date, now(), now()) returning id`, [b.id]);
    await client.query(`insert into public.deliveries
      (id, brewery_id, route_id, shipment_id, stop_no, delivered_at, outcome)
      select delivery_id, $1, $2, shipment_id, n, now(),
        case when n = 3 then 'partial' else 'delivered' end from today_history`,
    [b.id, route.rows[0].id]);
    await client.query(`analyze public.orders; analyze public.order_lines;
      analyze public.shipments; analyze public.deliveries`);

    type PlanNode = {
      "Index Name"?: string;
      "Relation Name"?: string;
      "Node Type": string;
      "Actual Rows": number;
      "Actual Loops": number;
      "Rows Removed by Filter"?: number;
      Plans?: PlanNode[];
    };
    const nodes = (node: PlanNode): PlanNode[] => [node, ...(node.Plans ?? []).flatMap(nodes)];
    for (const [reason, index] of [
      ["restock_due", "orders_needs_restock_idx"],
      ["refused_return", "order_lines_refused_idx"],
    ]) {
      const query = "select * from private.today_candidates where brewery_id = $1 and reason = $2";
      const explained = await client.query(`explain (analyze, buffers, format json) ${query}`, [b.id, reason]);
      const plan = nodes(explained.rows[0]["QUERY PLAN"][0].Plan);
      expect(plan.map(node => node["Index Name"])).toContain(index);
      // No scan of any history table may visit the whole 9,000-row fixture.
      // EXPLAIN reports rows per loop, so multiply by the loop count.
      const history = ["orders", "order_lines", "shipments", "deliveries"];
      for (const node of plan.filter(node => history.includes(node["Relation Name"] ?? ""))) {
        const visited = (node["Actual Rows"] + (node["Rows Removed by Filter"] ?? 0)) * node["Actual Loops"];
        expect(visited).toBeLessThan(9000);
      }
      const actual = await client.query(query, [b.id, reason]);
      const expected = await client.query(`select
        case when $1 = 'restock_due' then order_id else delivery_id end::text subject_id
        from today_history where case when $1 = 'restock_due' then n <= 2 else n = 3 end`, [reason]);
      const fixtureIds = new Set(expected.rows.map(row => row.subject_id));
      expect(actual.rows.filter(row => fixtureIds.has(row.subject_id)).map(row => row.subject_id).sort())
        .toEqual([...fixtureIds].sort());
    }
  } finally {
    await client.query("rollback");
    client.release();
  }
});
