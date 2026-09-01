// tests/command-idempotency.test.ts — verifies durable request replay at the database API boundary.
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { admin, asUser, makeBrewery, makeStaff } from "./helpers";

let breweryId: string;
let staffUserId: string;
let staffDb: SupabaseClient;
let skuId: string;
let locationId: string;

beforeAll(async () => {
  const brewery = await makeBrewery();
  breweryId = brewery.id;
  const staff = await makeStaff(breweryId, "admin");
  staffUserId = staff.id;
  staffDb = await asUser(staff.email);
  const product = await admin.from("products")
    .insert({ brewery_id: breweryId, name: "Idempotency product" })
    .select("id")
    .single();
  const sku = await admin.from("skus").insert({
    brewery_id: breweryId,
    product_id: product.data!.id,
    name: "Idempotency SKU",
    package_type: "keg",
    bbl_per_unit: 0.5,
  }).select("id").single();
  const location = await admin.from("locations")
    .insert({ brewery_id: breweryId, name: "Idempotency warehouse", kind: "warehouse" })
    .select("id")
    .single();
  skuId = sku.data!.id;
  locationId = location.data!.id;
});

describe("command request idempotency", () => {
  it("returns the original mutation result for an identical request id", async () => {
    const requestId = crypto.randomUUID();
    const payload = { p_brewery: breweryId, p_name: "Replay IPA", p_style: "IPA", p_abv: 6.5, p_request_id: requestId };

    const first = await staffDb.rpc("create_product", payload);
    const replay = await staffDb.rpc("create_product", payload);

    expect(first.error).toBeNull();
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual(first.data);
  });

  it("rejects reuse of a request id with a different payload", async () => {
    const requestId = crypto.randomUUID();
    const first = await staffDb.rpc("create_product", {
      p_brewery: breweryId, p_name: "Original", p_style: null, p_abv: null, p_request_id: requestId,
    });
    const mismatch = await staffDb.rpc("create_product", {
      p_brewery: breweryId, p_name: "Different", p_style: null, p_abv: null, p_request_id: requestId,
    });

    expect(first.error).toBeNull();
    expect(mismatch.error).not.toBeNull();
    expect(mismatch.error!.message).toMatch(/request id.*different payload/i);
  });

  it("rejects request reuse across command names and breweries", async () => {
    const requestId = crypto.randomUUID();
    const first = await staffDb.rpc("create_product", {
      p_brewery: breweryId,
      p_name: "Bound request",
      p_style: null,
      p_abv: null,
      p_request_id: requestId,
    });
    expect(first.error).toBeNull();

    const commandMismatch = await staffDb.rpc("create_location", {
      p_brewery: breweryId,
      p_name: "Wrong command",
      p_kind: "warehouse",
      p_request_id: requestId,
    });
    expect(commandMismatch.error?.message).toMatch(/request id.*different payload/i);

    const otherBrewery = await makeBrewery();
    await admin.from("brewery_users").insert({
      brewery_id: otherBrewery.id,
      user_id: staffUserId,
      role: "admin",
    });
    const breweryMismatch = await staffDb.rpc("create_product", {
      p_brewery: otherBrewery.id,
      p_name: "Wrong brewery",
      p_style: null,
      p_abv: null,
      p_request_id: requestId,
    });
    expect(breweryMismatch.error?.message).toMatch(/request id.*different payload/i);
  });

  it("serializes concurrent replays into one domain effect", async () => {
    const requestId = crypto.randomUUID();
    const note = `concurrent-${requestId}`;
    const payload = {
      p_brewery: breweryId,
      p_sku: skuId,
      p_location: locationId,
      p_qty: 2,
      p_type: "opening_balance",
      p_channel: null,
      p_dest_state: null,
      p_note: note,
      p_request_id: requestId,
    };
    const [one, two] = await Promise.all([
      staffDb.rpc("record_inventory_movement", payload),
      staffDb.rpc("record_inventory_movement", payload),
    ]);

    expect(one.error).toBeNull();
    expect(two.error).toBeNull();
    expect(one.data).toEqual(two.data);
    const effects = await admin.from("inventory_movements")
      .select("id")
      .eq("brewery_id", breweryId)
      .eq("note", note);
    expect(effects.data).toHaveLength(1);
  });
});
