import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, sql } from "./helpers";
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
