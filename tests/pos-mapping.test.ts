import { beforeAll, describe, expect, it } from "vitest";
import { admin, channelId, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

beforeAll(() => {
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54351");
  expect(process.env.DATABASE_URL).toContain(":54352/");
});

async function connected(breweryId: string, merchantId = `merchant-${crypto.randomUUID()}`) {
  const row = await admin.from("pos_connections").insert({
    brewery_id: breweryId, merchant_id: merchantId, state: "connected", credential_version: 1,
  }).select("id").single();
  expect(row.error).toBeNull();
  sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
    values('${breweryId}','square','${row.data!.id}','access','refresh',1)`);
  return row.data!.id as string;
}

describe("Square explicit mapping", () => {
  it("marks a recent old fact historical when the durable newer revision is outside the recent page", async () => {
    const brewery = await makeBrewery();
    const connectionId = await connected(brewery.id);
    const ctx = await makeStaffCtx(brewery.id, "warehouse");
    const target = { brewery_id: brewery.id, connection_id: connectionId, external_order_id: "PAGE-CURRENT",
      external_line_id: "line", source_version: 1, fact_kind: "sale", fact_status: "accepted",
      sold_at: "2026-09-10T12:00:00Z", ingested_at: "2030-01-01T00:00:00Z", qty: 1, source_quantity: "1" };
    const newer = { ...target, source_version: 2, ingested_at: "2000-01-01T00:00:00Z", qty: 2, source_quantity: "2" };
    const fillers = Array.from({ length: 100 }, (_, index) => ({ ...target,
      external_order_id: `FILLER-${index}`, external_line_id: `filler-${index}`,
      ingested_at: `2029-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    expect((await admin.from("pos_sales").insert([target, newer, ...fillers])).error).toBeNull();
    sql(`insert into private.square_order_snapshots(brewery_id,connection_id,merchant_id,external_order_id,source_version,snapshot_hash)
      values('${brewery.id}','${connectionId}','merchant-page','PAGE-CURRENT',1,'v1'),
        ('${brewery.id}','${connectionId}','merchant-page','PAGE-CURRENT',2,'v2')`);

    const listing = await runCommand("list_pos_sales", {}, ctx) as { sales: Array<{ externalOrderId: string; sourceVersion: string; current: boolean }> };
    expect(listing.sales).toHaveLength(100);
    expect(listing.sales).toContainEqual(expect.objectContaining({ externalOrderId: "PAGE-CURRENT", sourceVersion: "1", current: false }));
    expect(listing.sales).not.toContainEqual(expect.objectContaining({ externalOrderId: "PAGE-CURRENT", sourceVersion: "2" }));
  });

  it("completes sale enrichment and retained revision reads beyond the Data API row cap", async () => {
    const brewery = await makeBrewery();
    const connectionId = await connected(brewery.id);
    const ctx = await makeStaffCtx(brewery.id, "warehouse");
    const variations = Array.from({ length: 1001 }, (_, index) => ({
      brewery_id: brewery.id, connection_id: connectionId, external_item_id: `I-${String(index).padStart(4, "0")}`,
      external_variation_id: `V-${String(index).padStart(4, "0")}`, external_item_name: `Item ${index}`,
      external_variation_name: `Variation ${index}`, source_version: 1,
    }));
    expect((await admin.from("pos_catalog_variations").insert(variations)).error).toBeNull();
    expect((await admin.from("pos_item_mappings").insert(variations.map(row => ({
      brewery_id: row.brewery_id, connection_id: row.connection_id, external_item_id: row.external_item_id,
      external_variation_id: row.external_variation_id, ignored: true,
    })))).error).toBeNull();
    expect((await admin.from("pos_sales").insert({ brewery_id: brewery.id, connection_id: connectionId,
      external_order_id: "O-TARGET", external_line_id: "target", external_item_id: "I-1000", external_variation_id: "V-1000",
      sold_at: "2026-09-10T12:00:00Z", qty: 1, source_quantity: "1" })).error).toBeNull();
    const listing = await runCommand("list_pos_sales", {}, ctx) as { sales: { itemName: string; variationName: string; mappingStatus: string }[] };
    expect(listing.sales).toContainEqual(expect.objectContaining({ itemName: "Item 1000", variationName: "Variation 1000", mappingStatus: "ignored" }));

    const revisions = Array.from({ length: 1001 }, (_, index) => ({
      brewery_id: brewery.id, connection_id: connectionId, external_order_id: "O-MANY", external_line_id: `line-${String(index).padStart(4, "0")}`,
      source_version: 1, fact_kind: "sale", fact_status: "accepted", sold_at: "2026-09-10T13:00:00Z", qty: 1, source_quantity: "1",
    }));
    expect((await admin.from("pos_sales").insert(revisions)).error).toBeNull();
    const selected = await admin.from("pos_sales").select("id").eq("brewery_id", brewery.id).eq("external_order_id", "O-MANY").eq("external_line_id", "line-1000").single();
    expect(selected.error).toBeNull();
    const detail = await runCommand("get_pos_sale", { saleId: selected.data!.id }, ctx) as { revisions: unknown[] };
    expect(detail.revisions).toHaveLength(1001);
  }, 30_000);

  it("keeps pint and half-pint identities distinct and freezes reconciled expectations without movements", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const connectionId = await connected(brewery.id);
    const location = await seedLocation(brewery.id, { name: "Taproom", kind: "taproom" });
    const brand = await seedCatalog(brewery.id, { product: "Hazy", sku: "Hazy half", packageType: "keg", bblPerUnit: 0.5 });
    const pint = (await admin.from("formats").insert({ brewery_id: brewery.id, brand_id: brand.brandId, name: "Pint", basis: "poured", ounces: 16 }).select("id").single()).data!;
    const half = (await admin.from("formats").insert({ brewery_id: brewery.id, brand_id: brand.brandId, name: "Half pint", basis: "poured", ounces: 8 }).select("id").single()).data!;
    expect((await admin.from("pos_locations").insert({ brewery_id: brewery.id, connection_id: connectionId,
      external_location_id: "L1", external_name: "Square Taproom", external_status: "ACTIVE" })).error).toBeNull();
    expect((await admin.from("pos_catalog_variations").insert([
      { brewery_id: brewery.id, connection_id: connectionId, external_item_id: "I1", external_variation_id: "V16", external_item_name: "Hazy", external_variation_name: "Pint", source_version: 1 },
      { brewery_id: brewery.id, connection_id: connectionId, external_item_id: "I1", external_variation_id: "V8", external_item_name: "Hazy", external_variation_name: "Half pint", source_version: 2 },
    ])).error).toBeNull();
    expect((await admin.from("pos_sales").insert([
      { brewery_id: brewery.id, connection_id: connectionId, external_order_id: "O1", external_line_id: "1", external_item_id: "I1", external_variation_id: "V16", external_location_id: "L1", sold_at: new Date().toISOString(), qty: 1 },
      { brewery_id: brewery.id, connection_id: connectionId, external_order_id: "O1", external_line_id: "2", external_item_id: "I1", external_variation_id: "V8", external_location_id: "L1", sold_at: new Date().toISOString(), qty: 1 },
    ])).error).toBeNull();

    await runCommand("set_pos_location_mapping", { posLocationId: "L1", mgrLocationId: location.id }, ctx, { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });
    await runCommand("set_pos_item_mapping", { externalItemId: "I1", externalVariationId: "V16", formatId: pint.id, disposition: "mapped" }, ctx, { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });
    await runCommand("set_pos_item_mapping", { externalItemId: "I1", externalVariationId: "V8", formatId: half.id, disposition: "mapped" }, ctx, { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });

    const frozen = await admin.from("pos_sale_expectations").select("format_id,serving_ounces,expected_bbl").eq("brewery_id", brewery.id).order("serving_ounces", { ascending: false });
    expect(frozen.data).toMatchObject([{ format_id: pint.id, serving_ounces: 16 }, { format_id: half.id, serving_ounces: 8 }]);
    expect((await admin.from("inventory_movements").select("id").eq("brewery_id", brewery.id)).data).toEqual([]);

    await runCommand("set_pos_item_mapping", { externalItemId: "I1", externalVariationId: "V16", formatId: half.id, disposition: "mapped" }, ctx, { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });
    expect((await admin.from("pos_sale_expectations").select("format_id,serving_ounces").eq("brewery_id", brewery.id).order("serving_ounces", { ascending: false })).data)
      .toMatchObject([{ format_id: pint.id, serving_ounces: 16 }, { format_id: half.id, serving_ounces: 8 }]);

    expect((await admin.from("pos_sales_coverage").insert({ brewery_id: brewery.id, connection_id: connectionId,
      external_location_id: "L1", location_id: location.id, starts_at: "2026-09-01T00:00:00Z", ends_at: "2026-09-02T00:00:00Z", complete: true })).error).toBeNull();
    const warehouseCtx = await makeStaffCtx(brewery.id, "warehouse");
    const listing = await runCommand("list_pos_sales", {}, warehouseCtx) as { sales: { id: string; mappingStatus: string; expectedBbl: number | null; current: boolean }[]; coverage: { complete: boolean }[] };
    expect(listing.sales).toHaveLength(2);
    expect(listing.sales).toEqual(expect.arrayContaining([
      expect.objectContaining({ mappingStatus: "mapped", expectedBbl: expect.any(Number), current: true }),
    ]));
    expect(listing.coverage).toEqual([expect.objectContaining({ complete: true })]);
    const detail = await runCommand("get_pos_sale", { saleId: listing.sales[0].id }, warehouseCtx) as { sale: { id: string }; revisions: { id: string }[] };
    expect(detail.sale.id).toBe(listing.sales[0].id);
    expect(detail.revisions).toHaveLength(2);
    await expect(runCommand("list_pos_sales", {}, await makeStaffCtx(brewery.id, "sales"))).rejects.toMatchObject({ status: 403 });
  });

  it("refuses duplicate, cross-tenant, and historically observed location remaps", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const connectionId = await connected(brewery.id);
    const one = await seedLocation(brewery.id, { name: "One" });
    const two = await seedLocation(brewery.id, { name: "Two" });
    const foreign = await makeBrewery();
    const foreignLocation = await seedLocation(foreign.id, { name: "Foreign" });
    expect((await admin.from("pos_locations").insert([
      { brewery_id: brewery.id, connection_id: connectionId, external_location_id: "L1", external_name: "One" },
      { brewery_id: brewery.id, connection_id: connectionId, external_location_id: "L2", external_name: "Two" },
    ])).error).toBeNull();
    const call = (posLocationId: string, mgrLocationId: string) => runCommand("set_pos_location_mapping", { posLocationId, mgrLocationId }, ctx, { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });
    await expect(call("L1", one.id)).resolves.toMatchObject({ mapped: true });
    await expect(call("L2", one.id)).rejects.toMatchObject({ status: 409 });
    await expect(call("L2", foreignLocation.id)).rejects.toMatchObject({ status: 403 });

    expect((await admin.from("pos_sales_coverage").insert({ brewery_id: brewery.id, connection_id: connectionId,
      external_location_id: "L1", location_id: one.id, starts_at: "2026-09-01T00:00:00Z", ends_at: "2026-09-02T00:00:00Z", complete: true })).error).toBeNull();
    await expect(call("L1", two.id)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("history") });
  });

  it("explicitly clears an unobserved menu when its Square location is remapped", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const connectionId = await connected(brewery.id);
    const first = await seedLocation(brewery.id, { name: "First taproom", kind: "taproom" });
    const second = await seedLocation(brewery.id, { name: "Second taproom", kind: "taproom" });
    expect((await admin.from("pos_locations").insert({ brewery_id: brewery.id, connection_id: connectionId,
      external_location_id: "L-MOVE", external_name: "Movable", location_id: first.id })).error).toBeNull();
    const saleChannelId = await channelId(brewery.id, "Taproom");
    const configured = await runCommand("configure_pos_menu", {
      posLocationId: "L-MOVE", binId: first.binId, saleChannelId,
    }, ctx) as { publicId: string };

    await expect(runCommand("set_pos_location_mapping", {
      posLocationId: "L-MOVE", mgrLocationId: second.id,
    }, ctx)).resolves.toEqual({ mapped: true, menuCleared: true });
    expect((await admin.from("pos_menus").select("id").eq("public_id", configured.publicId)).data).toEqual([]);
    await expect(runCommand("get_pos_menu", { posLocationId: "L-MOVE" }, ctx))
      .rejects.toMatchObject({ message: "Menu is not configured" });
    await expect(runCommand("configure_pos_menu", {
      posLocationId: "L-MOVE", binId: second.binId, saleChannelId,
    }, ctx)).resolves.toMatchObject({ configured: true });
  });

  it("keeps ignored and unavailable variations visible with their mapping history", async () => {
    const brewery = await makeBrewery();
    const adminCtx = await makeStaffCtx(brewery.id, "admin");
    const warehouseCtx = await makeStaffCtx(brewery.id, "warehouse");
    const connectionId = await connected(brewery.id);
    const location = await seedLocation(brewery.id, { name: "Guest taproom", kind: "taproom" });
    expect((await admin.from("pos_locations").insert({ brewery_id: brewery.id, connection_id: connectionId,
      external_location_id: "L1", external_name: "Square taproom" })).error).toBeNull();
    expect((await admin.from("pos_catalog_variations").insert([
      { brewery_id: brewery.id, connection_id: connectionId, external_item_id: "FOOD", external_variation_id: "GUEST", external_item_name: "Guest cider", external_variation_name: "Pint", source_version: 1 },
      { brewery_id: brewery.id, connection_id: connectionId, external_item_id: "I1", external_variation_id: "OLD", external_item_name: "Hazy", external_variation_name: "Retired", source_version: 2 },
    ])).error).toBeNull();
    expect((await admin.from("pos_sales").insert({ brewery_id: brewery.id, connection_id: connectionId,
      external_order_id: "GUEST-ORDER", external_line_id: "1", external_item_id: "FOOD", external_variation_id: "GUEST",
      external_location_id: "L1", sold_at: new Date().toISOString(), qty: 1 })).error).toBeNull();
    await runCommand("set_pos_location_mapping", { posLocationId: "L1", mgrLocationId: location.id }, adminCtx,
      { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });
    await runCommand("set_pos_item_mapping", { externalItemId: "FOOD", externalVariationId: "GUEST", disposition: "ignored" }, warehouseCtx, { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });
    expect((await admin.from("pos_sale_expectations").select("sale_id").eq("brewery_id", brewery.id)).data).toEqual([]);
    expect((await admin.from("pos_catalog_variations").update({ available: false }).eq("connection_id", connectionId).eq("external_variation_id", "GUEST")).error).toBeNull();
    expect((await admin.from("pos_catalog_variations").update({ available: false }).eq("connection_id", connectionId).eq("external_variation_id", "OLD")).error).toBeNull();

    const rows = await runCommand("list_pos_variations", {}, warehouseCtx) as Array<Record<string, unknown>>;
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ externalVariationId: "GUEST", disposition: "ignored", available: false }),
      expect.objectContaining({ externalVariationId: "OLD", disposition: "queued", available: false }),
    ]));
    await expect(runCommand("list_pos_variations", {}, await makeStaffCtx(brewery.id, "sales"))).rejects.toMatchObject({ status: 403 });
    expect(JSON.stringify(await runCommand("get_pos_integration_health", {}, adminCtx)))
      .not.toMatch(/"accessToken"|"refreshToken"|access-secret|refresh-secret/i);
  });
});
