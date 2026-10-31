import { afterEach, describe, expect, it } from "vitest";
import { admin, closePgSessions, ins, insertFixture, makeBrewery, makeStaffCtx, pgSession, priceSku, seedCatalog, seedCustomer, seedLocation, staffSession } from "./helpers";
import { US_STATE_CODES } from "@/lib/mgr/enums";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

afterEach(closePgSessions);

async function fixture(packageType: "can" | "keg" = "can") {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id);
  const catalog = await seedCatalog(brewery.id, { packageType, bblPerUnit: 0.5 });
  const location = await seedLocation(brewery.id);
  return { brewery, ctx, catalog, location };
}

const period = { jurisdiction: "TTB", periodStart: "2026-01-01", periodEnd: "2026-01-31" };

describe("ledger compliance integrity", () => {
  it("allows timezone edits before filing, then preserves the timezone while allowing other settings and replay", async () => {
    const { brewery, ctx } = await fixture();
    const settings = { name: brewery.name, timezone: "America/Los_Angeles", readingDueHours: 24 };
    await runCommand("update_brewery", settings, ctx);
    const filed = await runCommand("file_compliance_report", period, ctx) as { figures: unknown };
    for (const timezone of ["UTC", "America/New_York"]) {
      await expect(runCommand("update_brewery", { ...settings, timezone }, ctx)).rejects.toThrow(/timezone cannot change after a report is filed/);
    }
    const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    const renamed = { ...settings, name: "Renamed after filing" };
    const saved = await runCommand("update_brewery", renamed, ctx, execution);
    expect(await runCommand("update_brewery", renamed, ctx, execution)).toEqual(saved);
    expect((await runCommand("generate_compliance_report", period, ctx) as { figures: unknown }).figures).toEqual(filed.figures);
    expect((await admin.from("breweries").select("timezone, name").eq("id", brewery.id).single()).data)
      .toEqual({ timezone: settings.timezone, name: renamed.name });
  });

  it("refuses invalid destination states through the RPC and accepts every supported state and territory", async () => {
    const { brewery, ctx, catalog, location } = await fixture();
    insertFixture("inventory_movements", {
      brewery_id: brewery.id, sku_id: catalog.skuId, location_id: location.id, bin_id: location.binId,
      created_by: ctx.userId, qty: 100, type: "opening_balance",
    });
    const record = (state: string) => ctx.db.rpc("record_inventory_movement", {
      p_brewery: brewery.id, p_sku: catalog.skuId, p_location: location.id, p_bin: location.binId,
      p_qty: -1, p_type: "sample", p_sale_channel: null, p_dest_state: state,
      p_note: null, p_request_id: crypto.randomUUID(),
    });
    expect((await record("ZZ")).error?.message).toMatch(/inventory_movements_destination_state/);
    for (const state of US_STATE_CODES) expect((await record(state)).error, state).toBeNull();
    const recorded = await admin.from("inventory_movements").select("dest_state").eq("brewery_id", brewery.id).eq("type", "sample");
    expect(recorded.error).toBeNull();
    expect(recorded.data?.map(row => row.dest_state).sort()).toEqual([...US_STATE_CODES].sort());
  });

  it("dates a returnable-keg shipment after local midnight with matching invoice, removal and keg-event dates", async () => {
    const { brewery, ctx, catalog, location } = await fixture("keg");
    const pool = await ins("keg_pools", { brewery_id: brewery.id, name: "Midnight fleet", kind: "owned", deposit_cents: 3000 });
    const linked = await admin.from("skus").update({ keg_pool_id: pool.id, container_source: "owned_fleet" }).eq("id", catalog.skuId);
    expect(linked.error).toBeNull();
    await runCommand("record_keg_event", { poolId: pool.id, kegSize: "half_bbl", qty: 10, reason: "acquired", locationId: location.id, binId: location.binId }, ctx);
    const customer = await seedCustomer(brewery.id);
    await priceSku(brewery.id, { saleChannelId: customer.saleChannelId, brandId: catalog.brandId, formatId: catalog.formatId, cents: 50 });
    insertFixture("inventory_movements", {
      brewery_id: brewery.id, sku_id: catalog.skuId, location_id: location.id, bin_id: location.binId,
      created_by: ctx.userId, qty: 10, type: "opening_balance", occurred_on: "2026-01-01",
    });
    const { order_id: orderId } = await runCommand("create_order", {
      kind: "wholesale", customerId: customer.customerId, shipToId: customer.shipToId,
      fromLocationId: location.id, lines: [{ skuId: catalog.skuId, qty: 1 }],
    }, ctx) as { order_id: string };
    await runCommand("submit_order", { orderId }, ctx);
    await runCommand("confirm_order", { orderId }, ctx);
    const line = (await admin.from("order_lines").select("id").eq("order_id", orderId).single()).data!;
    await runCommand("record_pick", { orderId, picks: [{ lineId: line.id, qty: 1 }] }, ctx);

    // A fixed-offset test zone places midnight two seconds after transaction start.
    // No database clock or global timezone is changed.
    const writer = await pgSession();
    await writer.query("begin");
    const started = (await writer.query<{ at: Date }>("select now() at")).rows[0].at;
    let offset = started.getUTCHours() * 3600 + started.getUTCMinutes() * 60 + started.getUTCSeconds() + 2;
    if (offset > 43200) offset -= 86400;
    const absolute = Math.abs(offset);
    const zone = `UTC${offset < 0 ? "-" : "+"}${Math.floor(absolute / 3600)}:${String(Math.floor(absolute / 60) % 60).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
    await writer.query("update public.breweries set timezone=$1 where id=$2", [zone, brewery.id]);
    await writer.query("select set_config('request.jwt.claim.sub',$1,true)", [ctx.userId]);
    await writer.query("set local role authenticated");
    await writer.query("select pg_sleep(2.2)");
    const requestId = crypto.randomUUID();
    const args = [orderId, JSON.stringify([{ line_id: line.id, qty_shipped: 1 }]), requestId];
    const shipped = (await writer.query("select public.ship_order($1,$2::jsonb,null,null,$3) result", args)).rows[0].result;
    const times = (await writer.query(`
      select (now() at time zone b.timezone)::date::text transaction_day,
        (s.shipped_at at time zone b.timezone)::date::text shipment_day,
        m.occurred_on::text, i.issued_on::text,
        m.created_at = s.shipped_at and o.shipped_at = s.shipped_at
          and k.at = s.shipped_at and k.created_at = s.shipped_at same_instant
      from public.shipments s join public.orders o on o.id=s.order_id
      join public.breweries b on b.id=s.brewery_id
      join public.inventory_movements m on m.ref=o.id and m.type='sale_removal'
      join public.keg_events k on k.shipment_id=s.id and k.reason='shipped'
      join public.invoices i on i.shipment_id=s.id where o.id=$1`, [orderId])).rows[0];
    expect(times.shipment_day).not.toBe(times.transaction_day);
    expect(times.occurred_on).toBe(times.shipment_day);
    expect(times.issued_on).toBe(times.shipment_day);
    expect(times.same_instant).toBe(true);
    expect((await writer.query("select public.ship_order($1,$2::jsonb,null,null,$3) result", args)).rows[0].result).toEqual(shipped);
    await writer.query("commit");
  });

  it("uses recording time for default movement dates but preserves explicit historical dates", async () => {
    const { brewery, ctx, catalog, location } = await fixture();
    const writer = await staffSession(ctx.userId);
    await writer.query("select pg_sleep(0.05)");
    const inserted = (await writer.query(`select public.record_inventory_movement(
      $1,$2,$3,$4,1,'opening_balance',null,null,null,$5) result`,
    [brewery.id, catalog.skuId, location.id, location.binId, crypto.randomUUID()])).rows[0].result;
    const times = (await writer.query("select now() < $1::timestamptz recorded_after_start", [inserted.created_at])).rows[0];
    expect(times.recorded_after_start).toBe(true);
    await writer.query("commit");
    const historical = insertFixture<{ created_at: string; occurred_on: string }>("inventory_movements", {
      brewery_id: brewery.id, sku_id: catalog.skuId, location_id: location.id, bin_id: location.binId,
      created_by: ctx.userId, qty: 1, type: "opening_balance", created_at: "2025-01-15T12:00:00Z", occurred_on: "2025-01-10",
    })[0];
    expect(historical.occurred_on).toBe("2025-01-10");
    expect(new Date(historical.created_at).toISOString()).toBe("2025-01-15T12:00:00.000Z");
  });
});
