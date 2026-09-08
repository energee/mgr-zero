import { describe, it, expect, beforeAll } from "vitest";
import { makeBrewery, makeStaffCtx, admin, channelId, seedCatalog, seedLocation, seedPriceGroup, ins } from "./helpers";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";

describe("import_csv rows", () => {
  let ctx: Ctx, sales: Ctx, channel: string, sku: string, format: string, location: string, bin: string;
  beforeAll(async () => {
    const b = await makeBrewery(); ctx = await makeStaffCtx(b.id); sales = await makeStaffCtx(b.id, "sales");
    channel = await channelId(b.id, "Wholesale");
    ({ skuId: sku, formatId: format } = await seedCatalog(b.id));
    ({ id: location, binId: bin } = await seedLocation(b.id));
  });
  const execute = (kind: string, rows: Record<string,string>[], requestId = crypto.randomUUID()) =>
    runCommand("import_csv", { kind, rows }, ctx, { requestId, correlationId: crypto.randomUUID() }) as Promise<{ committed: number; blocked: number; outcomes: { row: number; status: string; result?: { id: string }; error?: string }[] }>;
  it("commits valid siblings and returns original IDs on parent replay", async () => {
    const rows = [{ name: "Imported", type: "retailer", state: "PA", saleChannelId: channel }, { name: "Blocked", type: "retailer", state: "PA", saleChannelId: "" }];
    const id = crypto.randomUUID(); const first = await execute("customers", rows, id);
    expect(first.committed).toBe(1); expect(first.blocked).toBe(1);
    expect(await execute("customers", rows, id)).toEqual(first);
    expect((await admin.from("customers").select("id").eq("brewery_id", ctx.breweryId).eq("name", "Imported")).data).toHaveLength(1);
    await expect(execute("customers", [...rows, rows[0]], id)).rejects.toThrow(/different payload/);
    await expect(execute("ship_tos", rows, id)).rejects.toThrow(/different payload/);
  });
  it("opening balance replay never appends again", async () => {
    const row = { skuId: sku, locationId: location, binId: bin, qty: "12.5" }; const id = crypto.randomUUID();
    const first = await execute("opening_balances", [row], id); expect(first.committed).toBe(1);
    expect(await execute("opening_balances", [row], id)).toEqual(first);
    expect((await admin.from("inventory_movements").select("id").eq("sku_id", sku)).data).toHaveLength(1);
  });
  it("dependent SKU failure rolls back new brand/style", async () => {
    const result = await execute("products_skus", [{ product: "Rollback brand", style: "Rollback style", formatId: crypto.randomUUID() }]);
    expect(result.blocked).toBe(1);
    expect((await admin.from("brands").select("id").eq("brewery_id", ctx.breweryId).eq("name", "Rollback brand")).data).toEqual([]);
    expect((await admin.from("styles").select("id").eq("brewery_id", ctx.breweryId).eq("name", "Rollback style")).data).toEqual([]);
    expect((await execute("products_skus", [{ product: "Imported brand", formatId: format }])).committed).toBe(1);
  });
  it("rejects nonadmin and direct row calls without a matching manifest", async () => {
    await expect(runCommand("import_csv", { kind: "customers", rows: [] }, sales)).rejects.toThrow(/permission/);
    expect((await ctx.db.rpc("import_csv_row", { p_brewery: ctx.breweryId, p_request_id: crypto.randomUUID(), p_row_n: 0 })).error).not.toBeNull();
    expect((await sales.db.rpc("begin_csv_import", { p_brewery: ctx.breweryId, p_request_id: crypto.randomUUID(), p_kind: "customers", p_rows: [] })).error?.code).toBe("42501");
  });
  it("binds brewery, rejects direct malformed manifests/indices, and rechecks role on replay", async () => {
    const id = crypto.randomUUID(); const rows = [{ skuId: sku, locationId: location, binId: bin, qty: "3" }];
    const first = await execute("opening_balances", rows, id); expect(first.committed).toBe(1);
    const other = await makeBrewery();
    await admin.from("brewery_users").insert({ brewery_id: other.id, user_id: ctx.userId, role: "admin" });
    const begin = (args: Record<string, unknown>) => ctx.db.rpc("begin_csv_import", { p_brewery: ctx.breweryId, p_request_id: crypto.randomUUID(), p_kind: "opening_balances", p_rows: rows, ...args });
    expect((await begin({ p_brewery: other.id, p_request_id: id })).error?.code).toBe("MG409");
    for (const p_rows of [null, {}, [], Array(5001).fill({}), [{ qty: 2 }], [null]]) expect((await begin({ p_rows })).error).not.toBeNull();
    expect((await begin({ p_kind: "made_up" })).error).not.toBeNull();
    for (const p_row_n of [-1, 1, 5000, null]) expect((await ctx.db.rpc("import_csv_row", { p_brewery: ctx.breweryId, p_request_id: id, p_row_n })).error).not.toBeNull();
    expect((await ctx.db.rpc("import_csv_row", { p_brewery: other.id, p_request_id: id, p_row_n: 0 })).error).not.toBeNull();
    await admin.from("brewery_users").update({ role: "sales" }).eq("brewery_id", ctx.breweryId).eq("user_id", ctx.userId);
    expect((await ctx.db.rpc("import_csv_row", { p_brewery: ctx.breweryId, p_request_id: id, p_row_n: 0 })).error?.code).toBe("42501");
    await admin.from("brewery_users").update({ role: "admin" }).eq("brewery_id", ctx.breweryId).eq("user_id", ctx.userId);
  });
  it("validates direct Data API number shape, required fields and cross-tenant references per row", async () => {
    const other = await makeBrewery(); const otherLocation = await seedLocation(other.id);
    const rows = ["NaN", "Infinity", "0x10", "1e3", "-1", "0", ""].map(qty => ({ skuId: sku, locationId: location, binId: bin, qty }));
    rows.push({ skuId: sku, locationId: otherLocation.id, binId: otherLocation.binId, qty: "2" });
    const id = crypto.randomUUID();
    expect((await ctx.db.rpc("begin_csv_import", { p_brewery: ctx.breweryId, p_request_id: id, p_kind: "opening_balances", p_rows: rows })).error).toBeNull();
    for (let n = 0; n < rows.length; n++) {
      const call = await ctx.db.rpc("import_csv_row", { p_brewery: ctx.breweryId, p_request_id: id, p_row_n: n });
      expect(call.error).toBeNull(); expect(call.data.status).toBe("blocked");
    }
  });
  it("blocks a foreign existing price cell without aborting either valid sibling or replay", async () => {
    const other = await makeBrewery();
    const otherChannel = await channelId(other.id, "Wholesale");
    const otherGroup = await seedPriceGroup(other.id);
    const { formatId: otherFormat } = await seedCatalog(other.id);
    await ins("channel_prices", { brewery_id: other.id, sale_channel_id: otherChannel, price_group_id: otherGroup, format_id: otherFormat, unit_price_cents: 900 });
    const ownGroup = await seedPriceGroup(ctx.breweryId, "Mixed import", 2);
    const ownChannel = await channelId(ctx.breweryId, "Taproom");
    const rows = [
      { saleChannelId: channel, priceGroupId: ownGroup, formatId: format, unitPriceCents: "100" },
      { saleChannelId: otherChannel, priceGroupId: otherGroup, formatId: otherFormat, unitPriceCents: "999" },
      { saleChannelId: ownChannel, priceGroupId: ownGroup, formatId: format, unitPriceCents: "200" },
    ];
    const requestId = crypto.randomUUID();
    const result = await execute("channel_prices", rows, requestId);
    expect(result).toMatchObject({ committed: 2, blocked: 1, outcomes: [
      { row: 1, status: "committed" }, { row: 2, status: "blocked", error: "permission denied" }, { row: 3, status: "committed" },
    ] });
    expect(await execute("channel_prices", rows, requestId)).toEqual(result);
    expect((await admin.from("channel_prices").select("unit_price_cents").eq("sale_channel_id", otherChannel).eq("price_group_id", otherGroup).eq("format_id", otherFormat).single()).data?.unit_price_cents).toBe(900);
    expect((await admin.from("channel_prices").select("unit_price_cents").eq("price_group_id", ownGroup).order("unit_price_cents")).data).toEqual([{ unit_price_cents: 100 }, { unit_price_cents: 200 }]);
    const direct = (db: Ctx["db"]) => db.rpc("import_csv_row", { p_brewery: ctx.breweryId, p_request_id: requestId, p_row_n: 1 });
    expect((await direct(sales.db)).error?.code).toBe("42501");
    await admin.from("brewery_users").update({ role: "sales" }).eq("brewery_id", ctx.breweryId).eq("user_id", ctx.userId);
    try { expect((await direct(ctx.db)).error?.code).toBe("42501"); }
    finally { await admin.from("brewery_users").update({ role: "admin" }).eq("brewery_id", ctx.breweryId).eq("user_id", ctx.userId); }
  });
  it("imports ship-tos and channel price cells and reports duplicate creates explicitly", async () => {
    const customer = await execute("customers", [{ name: "Ship customer", type: "retailer", state: "PA", saleChannelId: channel }]);
    const customerId = customer.outcomes[0].result!.id;
    const ships = await execute("ship_tos", [{ customerId, label: "Main", address1: "1 Main", city: "Town", state: "PA", zip: "19000" }, { customerId, label: "Bad" }]);
    expect(ships.committed).toBe(1); expect(ships.blocked).toBe(1);
    const { data: group } = await admin.from("price_groups").insert({ brewery_id: ctx.breweryId, name: "Import", position: 1 }).select("id").single();
    const prices = await execute("channel_prices", [{ saleChannelId: channel, priceGroupId: group!.id, formatId: format, unitPriceCents: "1234" }, { saleChannelId: channel, priceGroupId: group!.id, formatId: format, unitPriceCents: "1.2" }]);
    expect(prices.committed).toBe(1); expect(prices.blocked).toBe(1);
    expect((await execute("customers", [{ name: "Ship customer", type: "retailer", state: "PA", saleChannelId: channel }])).blocked).toBe(1);
  });

});
