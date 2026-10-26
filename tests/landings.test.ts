// tests/landings.test.ts — Program 10 task 2: the Beer and Work landings read
// one registered query each. get_beer_overview is counts every staff role may
// read (zeros allowed); list_work unions Today's rows with the open purchase
// orders and routes the caller's role may open, each tagged with a Work chip.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { asUser, channelId, ins, insertFixture, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import { defaultWorkKinds, type WorkRow } from "@/lib/commands/landings";
import "@/lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let b: { id: string }, adminCtx: Ctx, sales: Ctx, warehouse: Ctx, brewer: Ctx;

beforeAll(async () => {
  b = await makeBrewery();
  [adminCtx, sales, warehouse, brewer] = await Promise.all([
    makeStaffCtx(b.id, "admin"), makeStaffCtx(b.id, "sales"), makeStaffCtx(b.id, "warehouse"), makeStaffCtx(b.id, "brewer"),
  ]);
});

describe("get_beer_overview", () => {
  it("returns only displayed counts for every non-taproom staff role without querying material requirements (#1421)", async () => {
    for (const ctx of [adminCtx, sales, warehouse, brewer]) {
      const fetch = vi.spyOn(globalThis, "fetch");
      try {
        const o = await runCommand("get_beer_overview", {}, ctx) as Record<string, number>;
        for (const k of ["fgShortages", "taproomBelowPar", "openTaps", "openOccupancies", "kegsOut"]) {
          expect(typeof o[k], `${ctx.roles.join("+")} ${k}`).toBe("number");
        }
        expect(o).toEqual({
          fgShortages: 0, taproomBelowPar: 0, openTaps: 0, openOccupancies: 0, kegsOut: 0,
        });
        expect(fetch.mock.calls.map(([url]) => new URL(String(url)).pathname).sort()).toEqual([
          "/rest/v1/atp", "/rest/v1/occupancy_volumes", "/rest/v1/rpc/get_beer_overview_aggregates", "/rest/v1/tap_intervals",
        ]);
      } finally { fetch.mockRestore(); }
    }
  });

  it("keeps strict below-par comparisons for missing, negative, zero and positive stock", async () => {
    const own = await makeBrewery();
    const owner = await makeStaffCtx(own.id);
    const catalog = await seedCatalog(own.id);
    const cases = [
      { name: "Missing at zero", par: 0, qty: undefined },
      { name: "Missing below positive", par: 2, qty: undefined },
      { name: "Negative below zero", par: 0, qty: -1 },
      { name: "Zero equals zero", par: 0, qty: 0 },
      { name: "Positive below par", par: 2, qty: 1 },
      { name: "Fraction below par", par: 2, qty: 1.99 },
      { name: "Positive equals par", par: 2, qty: 2 },
      { name: "Positive above par", par: 2, qty: 3 },
    ];
    for (const row of cases) {
      const location = await seedLocation(own.id, { name: row.name, uses: ["taproom"] });
      await ins("taproom_pars", { brewery_id: own.id, location_id: location.id, sku_id: catalog.skuId, par_qty: row.par });
      // Zero stock with a real aggregate row is distinct from no movement row.
      const quantities = row.qty === undefined ? [] : row.qty === 0 ? [1, -1] : [row.qty];
      insertFixture("inventory_movements", quantities.map(qty => ({
        brewery_id: own.id, location_id: location.id, bin_id: location.binId, sku_id: catalog.skuId,
        qty, type: "adjustment", created_by: owner.userId,
      })));
    }
    expect(await runCommand("get_beer_overview", {}, owner)).toEqual({
      fgShortages: 0, taproomBelowPar: 4, openTaps: 0, openOccupancies: 0, kegsOut: 0,
    });
  });

  it("aggregates more than 1000 pars, stock rows and signed customer keg balances", async () => {
    const own = await makeBrewery();
    const [owner, location, catalog, customer] = await Promise.all([
      makeStaffCtx(own.id),
      seedLocation(own.id, { uses: ["taproom"] }),
      seedCatalog(own.id),
      seedCustomer(own.id),
    ]);
    // Set-based fixtures exercise every source grid beyond PostgREST's row cap
    // without issuing thousands of HTTP requests or returning the fixture grids.
    // 150 SKUs × 14 locations keeps the unrelated per-SKU ATP read realistic.
    // Each side of the threshold has 1050 pairs, so truncating either source
    // to 1000 rows must change the result, regardless of row ordering.
    sql(`
      with brands as (
        insert into public.brands (brewery_id, name)
        select '${own.id}', 'Grid ' || n from generate_series(1, 150) n returning id, name
      )
      insert into public.skus (brewery_id, brand_id, format_id, name)
      select '${own.id}', id, '${catalog.formatId}', name from brands;

      with locations as (
        insert into public.locations (brewery_id, name, uses)
        select '${own.id}', 'Grid ' || lpad(n::text, 2, '0'), array['taproom']::public.location_kind[]
        from generate_series(1, 14) n returning id
      )
      insert into public.bins (brewery_id, location_id, name)
      select '${own.id}', id, 'Cold' from locations;

      insert into public.taproom_pars (brewery_id, location_id, sku_id, par_qty)
      select '${own.id}', l.id, s.id, 2 from public.skus s
      cross join public.locations l
      where s.brewery_id = '${own.id}' and s.id <> '${catalog.skuId}'
        and l.brewery_id = '${own.id}' and l.id <> '${location.id}';

      insert into public.inventory_movements (brewery_id, location_id, bin_id, sku_id, qty, type, created_by)
      select '${own.id}', l.id, bin.id, s.id,
        case when l.name <= 'Grid 07' then 1 else 2 end, 'opening_balance', '${owner.userId}'
      from public.skus s cross join public.locations l
      join public.bins bin on bin.location_id = l.id and bin.brewery_id = l.brewery_id
      where s.brewery_id = '${own.id}' and s.id <> '${catalog.skuId}'
        and l.brewery_id = '${own.id}' and l.id <> '${location.id}';

      with pools as (
        insert into public.keg_pools (brewery_id, name, kind)
        select '${own.id}', 'Grid ' || n, 'owned' from generate_series(1, 1005) n returning id
      )
      insert into public.keg_events (brewery_id, pool_id, keg_size, location_id, bin_id, customer_id, qty, reason, created_by)
      select '${own.id}', id, 'half_bbl', '${location.id}', '${location.binId}', '${customer.customerId}',
        2, 'shipped', '${owner.userId}' from pools;

      insert into public.keg_events (brewery_id, pool_id, keg_size, location_id, bin_id, customer_id, qty, reason, created_by)
      select '${own.id}', id, 'half_bbl', '${location.id}', '${location.binId}', '${customer.customerId}',
        2011, 'returned', '${owner.userId}' from public.keg_pools where brewery_id = '${own.id}' and name = 'Grid 1';
    `, true);
    expect(await runCommand("get_beer_overview", {}, owner)).toEqual({
      fgShortages: 0, taproomBelowPar: 1050, openTaps: 0, openOccupancies: 0, kegsOut: -1,
    });
  });
});

describe("get_beer_overview_aggregates SQL boundary", () => {
  it("aggregates only caller-visible tenant rows, including missing stock and signed keg balances", async () => {
    const own = await makeBrewery();
    const [owner, production, selling, handling, location, catalog, customer] = await Promise.all([
      makeStaffCtx(own.id, "admin"),
      makeStaffCtx(own.id, "brewer"),
      makeStaffCtx(own.id, "sales"),
      makeStaffCtx(own.id, "warehouse"),
      seedLocation(own.id, { uses: ["taproom"] }),
      seedCatalog(own.id),
      seedCustomer(own.id),
    ]);
    const pool = await ins("keg_pools", { brewery_id: own.id, name: "Owned", kind: "owned" });
    await ins("taproom_pars", { brewery_id: own.id, location_id: location.id, sku_id: catalog.skuId, par_qty: 2 });
    for (const [reason, qty] of [["shipped", 2], ["returned", 5]] as const) {
      await ins("keg_events", {
        brewery_id: own.id, pool_id: pool.id, keg_size: "half_bbl", location_id: location.id,
        bin_id: location.binId, customer_id: customer.customerId, created_by: owner.userId, reason, qty,
      });
    }
    const buyer = await makeCustomerUser(customer.customerId);
    const buyerDb = await asUser(buyer.email);
    for (const ctx of [owner, production, selling, handling]) {
      const result = await ctx.db.rpc("get_beer_overview_aggregates", { p_brewery: own.id });
      expect(result.error).toBeNull();
      expect(result.data).toEqual([{ taproom_below_par: 1, kegs_out: -3 }]);
      expect(await runCommand("get_beer_overview", {}, ctx)).toEqual({
        fgShortages: 0, taproomBelowPar: 1, openTaps: 0, openOccupancies: 0, kegsOut: -3,
      });
    }
    // Both another tenant's staff and this tenant's buyer see none of its metrics.
    for (const db of [adminCtx.db, buyerDb]) {
      const result = await db.rpc("get_beer_overview_aggregates", { p_brewery: own.id });
      expect(result.error).toBeNull();
      expect(result.data).toEqual([{ taproom_below_par: 0, kegs_out: 0 }]);
    }
  });

  it("uses the full overview for taproom plus brewer, but keeps taproom-only stock", async () => {
    const taproom = await makeStaffCtx(b.id, "taproom");
    const combined = await makeStaffCtx(b.id, ["brewer", "taproom"]);
    expect(await runCommand("get_beer_overview", {}, taproom)).toEqual({ taproomStock: [] });
    const overview = await runCommand("get_beer_overview", {}, combined) as Record<string, unknown>;
    expect(overview).not.toHaveProperty("taproomStock");
    expect(overview).toHaveProperty("openOccupancies", 0);
  });
});

describe("defaultWorkKinds", () => {
  it("unions all held roles without duplicate chips or role-order dependence", () => {
    const expected = ["orders", "batches", "runs", "POs"];
    expect(defaultWorkKinds(["sales", "brewer"])).toEqual(expected);
    expect(defaultWorkKinds(["brewer", "sales"])).toEqual(expected);
    expect(defaultWorkKinds(["warehouse", "brewer"])).toEqual(["orders", "transfers", "batches", "runs", "POs", "routes"]);
    expect(defaultWorkKinds(["taproom"])).toEqual([]);
    expect(defaultWorkKinds(["admin", "sales"])).toEqual(["orders", "transfers", "batches", "runs", "POs", "routes"]);
  });
});

describe("list_work", () => {
  it("unions Today rows with the open documents the role may open, tagged by chip", async () => {
    const wh = await ins("locations", { brewery_id: b.id, name: "WH", uses: ["warehouse"] });
    const brand = await ins("brands", { brewery_id: b.id, name: "IPA" });
    const format = await ins("formats", { brewery_id: b.id, name: "1/2 bbl keg", basis: "packaged", package_type: "keg", keg_size: "half_bbl", bbl_per_unit: 0.5 });
    const sku = await ins("skus", { brewery_id: b.id, brand_id: brand.id, format_id: format.id, name: "IPA 1/2bbl" });
    const wholesale = await channelId(b.id, "Wholesale");
    const customer = await ins("customers", { brewery_id: b.id, name: "Bar", type: "retailer", state: "PA", sale_channel_id: wholesale });
    await priceSku(b.id, { saleChannelId: wholesale, brandId: brand.id, formatId: format.id, cents: 12000 });
    const shipTo = await ins("ship_tos", { brewery_id: b.id, customer_id: customer.id, label: "m", address1: "1", city: "P", state: "PA", zip: "19100" });
    const order = await runCommand("create_order", { kind: "wholesale", customerId: customer.id, shipToId: shipTo.id, fromLocationId: wh.id, requestedShipDate: "2026-09-09", lines: [{ skuId: sku.id, qty: 1 }] }, adminCtx) as { order_id: string };
    await runCommand("submit_order", { orderId: order.order_id }, adminCtx);
    const vendor = await runCommand("upsert_vendor", { name: "Malt Co" }, adminCtx) as { id: string };
    const malt = await runCommand("upsert_material", { name: "2-row", category: "malt", baseUom: "lb", purchaseUom: "lb" }, adminCtx) as { id: string };
    const po = await runCommand("create_purchase_order", { vendorId: vendor.id, lines: [{ materialId: malt.id, qtyOrdered: 5 }] }, adminCtx) as { id: string };

    const kinds = async (ctx: Ctx) => (await runCommand("list_work", {}, ctx) as WorkRow[]).map((r) => `${r.kind}:${r.href}`);
    expect(await kinds(sales)).toContain(`orders:/orders/${order.order_id}`);
    expect(await kinds(sales)).not.toContain(`POs:/purchase-orders/${po.id}`);
    expect(await kinds(warehouse)).toContain(`POs:/purchase-orders/${po.id}`);
    expect((await kinds(brewer)).some((k) => k.startsWith("routes:"))).toBe(false);
    const all = await runCommand("list_work", {}, adminCtx) as WorkRow[];
    for (const r of all) expect(["orders", "transfers", "batches", "runs", "POs", "routes"]).toContain(r.kind);
    // #759: a route row counts its stops without list_work reading them; a returned route is not in motion.
    const open = await ins("routes", { brewery_id: b.id, name: "Tuesday", delivery_date: "2026-09-09" });
    await ins("routes", { brewery_id: b.id, name: "Done", delivery_date: "2026-09-01", departed_at: "2026-09-01T08:00:00Z", returned_at: "2026-09-01T17:00:00Z" });
    const routes = (await runCommand("list_work", {}, adminCtx) as WorkRow[]).filter((r) => r.kind === "routes");
    expect(routes).toEqual([expect.objectContaining({ id: open.id, label: "Tuesday", detail: "0 stops · Sep 9, 2026", href: `/routes/${open.id}`, verb: "Depart", dueAt: "2026-09-09" })]);
    expect(all.every((r) => typeof r.label === "string" && typeof r.verb === "string")).toBe(true);
  });
});

describe("get_first_run_state", () => {
  it("is all false on a new brewery and flips as setup lands", async () => {
    const fresh = await makeBrewery();
    const owner = await makeStaffCtx(fresh.id, "admin");
    expect(await runCommand("get_first_run_state", {}, owner)).toEqual({ hasLocation: false, hasBrand: false, hasMovement: false, hasStaff: false });
    await runCommand("create_location", { name: "WH", uses: ["warehouse"] }, owner);
    await makeStaffCtx(fresh.id, "sales");
    expect(await runCommand("get_first_run_state", {}, owner)).toMatchObject({ hasLocation: true, hasBrand: false, hasStaff: true });
  });
});
