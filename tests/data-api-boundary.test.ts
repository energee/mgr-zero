// tests/data-api-boundary.test.ts — proves authenticated callers use narrow RPCs, not table DML.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { admin, asUser, makeBrewery, makeStaff } from "./helpers";

let breweryId: string;
let staffDb: SupabaseClient;

beforeAll(async () => {
  const brewery = await makeBrewery();
  breweryId = brewery.id;
  const staff = await makeStaff(breweryId, "admin");
  staffDb = await asUser(staff.email);
});

describe("Data API mutation boundary", () => {
  it("denies authenticated table insert, update, and delete", async () => {
    const { error: insertError } = await staffDb.from("products").insert({
      brewery_id: breweryId,
      name: "Forbidden direct write",
    });
    expect(insertError).not.toBeNull();

    const product = await admin.from("products").insert({ brewery_id: breweryId, name: "Admin seed" }).select("id").single();
    expect(product.error).toBeNull();

    const { error: updateError } = await staffDb.from("products").update({ name: "Forbidden update" }).eq("id", product.data!.id);
    const { error: deleteError } = await staffDb.from("products").delete().eq("id", product.data!.id);
    expect(updateError).not.toBeNull();
    expect(deleteError).not.toBeNull();
  });

  it("blocks cross-tenant conflict updates and normalizes location lookup failures", async () => {
    const foreignBrewery = await makeBrewery();
    const product = await admin.from("products")
      .insert({ brewery_id: foreignBrewery.id, name: "Foreign product" })
      .select("id")
      .single();
    const sku = await admin.from("skus").insert({
      brewery_id: foreignBrewery.id,
      product_id: product.data!.id,
      name: "Foreign SKU",
      package_type: "keg",
      bbl_per_unit: 0.5,
    }).select("id").single();
    const priceList = await admin.from("price_lists")
      .insert({ brewery_id: foreignBrewery.id, name: "Foreign prices" })
      .select("id")
      .single();
    const location = await admin.from("locations").insert({
      brewery_id: foreignBrewery.id,
      name: "Foreign taproom",
      kind: "taproom",
    }).select("id").single();
    await admin.from("price_list_items").insert({
      brewery_id: foreignBrewery.id,
      price_list_id: priceList.data!.id,
      sku_id: sku.data!.id,
      unit_price_cents: 1000,
    });
    await admin.from("taproom_pars").insert({
      brewery_id: foreignBrewery.id,
      location_id: location.data!.id,
      sku_id: sku.data!.id,
      par_qty: 5,
    });

    const priceAttempt = await staffDb.rpc("set_price", {
      p_brewery: breweryId,
      p_price_list: priceList.data!.id,
      p_sku: sku.data!.id,
      p_unit_price_cents: 9999,
      p_request_id: crypto.randomUUID(),
    });
    const parAttempt = await staffDb.rpc("set_taproom_par", {
      p_brewery: breweryId,
      p_location: location.data!.id,
      p_sku: sku.data!.id,
      p_par_qty: 99,
      p_request_id: crypto.randomUUID(),
    });
    expect(priceAttempt.error).not.toBeNull();
    expect(parAttempt.error).not.toBeNull();

    const foreignPrice = await admin.from("price_list_items")
      .select("unit_price_cents")
      .eq("price_list_id", priceList.data!.id)
      .eq("sku_id", sku.data!.id)
      .single();
    const foreignPar = await admin.from("taproom_pars")
      .select("par_qty")
      .eq("location_id", location.data!.id)
      .eq("sku_id", sku.data!.id)
      .single();
    expect(foreignPrice.data!.unit_price_cents).toBe(1000);
    expect(Number(foreignPar.data!.par_qty)).toBe(5);

    const foreignLocation = await staffDb.rpc("set_standing_allocation", {
      p_location: location.data!.id,
      p_sku: sku.data!.id,
      p_qty: 1,
      p_request_id: crypto.randomUUID(),
    });
    const absentLocation = await staffDb.rpc("set_standing_allocation", {
      p_location: crypto.randomUUID(),
      p_sku: sku.data!.id,
      p_qty: 1,
      p_request_id: crypto.randomUUID(),
    });
    expect(foreignLocation.error?.message).toBe(absentLocation.error?.message);
    expect(foreignLocation.error?.message).toMatch(/permission denied/i);
  });

  it("preserves the RLS-backed invoice totals read", async () => {
    const { error } = await staffDb.from("invoice_totals").select("invoice_id").limit(1);
    expect(error).toBeNull();
  });

  it("denies anonymous and private helper calls while allowing named writes", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const { error: anonymousError } = await anon.rpc("create_product", {
      p_brewery: breweryId,
      p_name: "Anonymous",
      p_style: null,
      p_abv: null,
      p_request_id: crypto.randomUUID(),
    });
    const { error: privateError } = await staffDb.rpc("claim_command_request", {
      p_request_id: crypto.randomUUID(),
      p_payload: {},
    });
    const { data, error } = await staffDb.rpc("create_product", {
      p_brewery: breweryId,
      p_name: "Via RPC",
      p_style: null,
      p_abv: null,
      p_request_id: crypto.randomUUID(),
    });

    expect(anonymousError).not.toBeNull();
    expect(privateError).not.toBeNull();
    expect(error).toBeNull();
    expect(data).toMatchObject({ name: "Via RPC", brewery_id: breweryId });
  });
});
