// tests/rls-ledger.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaff, asUser } from "./helpers";

describe("ledger integrity + RLS", () => {
  let b: any, staff: any, sku: any, loc: any;
  beforeAll(async () => {
    b = await makeBrewery();
    staff = await makeStaff(b.id, "warehouse");
    const { data: p } = await admin.from("products").insert({ brewery_id: b.id, name: "Hazy IPA" }).select().single();
    ({ data: sku } = await admin.from("skus").insert({ brewery_id: b.id, product_id: p!.id, name: "1/2 bbl keg", package_type: "keg", bbl_per_unit: 0.5 }).select().single());
    ({ data: loc } = await admin.from("locations").insert({ brewery_id: b.id, name: "Main WH", kind: "warehouse" }).select().single());
  });

  it("staff can insert movements; ledger is append-only", async () => {
    const db = await asUser(staff.email);
    const { data: { user } } = await db.auth.getUser();
    const { data: m, error } = await db.from("inventory_movements").insert({
      brewery_id: b.id, sku_id: sku.id, location_id: loc.id,
      qty: 10, bbl: 5, type: "opening_balance", created_by: user!.id,
    }).select().single();
    expect(error).toBeNull();
    // No UPDATE/DELETE grants: PostgREST returns a permission error (or zero affected rows).
    const upd = await db.from("inventory_movements").update({ qty: 99 }).eq("id", m!.id).select();
    expect(upd.error !== null || upd.data?.length === 0).toBe(true);
    const del = await db.from("inventory_movements").delete().eq("id", m!.id).select();
    expect(del.error !== null || del.data?.length === 0).toBe(true);
    const { data: still } = await admin.from("inventory_movements").select("qty").eq("id", m!.id).single();
    expect(Number(still!.qty)).toBe(10);
  });

  it("sale_removal without dest_state is rejected by CHECK", async () => {
    const db = await asUser(staff.email);
    const { data: { user } } = await db.auth.getUser();
    const { error } = await db.from("inventory_movements").insert({
      brewery_id: b.id, sku_id: sku.id, location_id: loc.id,
      qty: -1, bbl: -0.5, type: "sale_removal", channel: "wholesale", created_by: user!.id,
    });
    expect(error).not.toBeNull();
  });

  it("on_hand and atp views sum correctly", async () => {
    const db = await asUser(staff.email);
    const { data: oh } = await db.from("on_hand").select().eq("sku_id", sku.id);
    expect(Number(oh![0].qty)).toBe(10);
    await admin.from("allocations").insert({ brewery_id: b.id, sku_id: sku.id, qty: 4, source: "taproom_standing", ref: loc.id });
    const { data: atp } = await db.from("atp").select().eq("sku_id", sku.id);
    expect(Number(atp![0].qty)).toBe(6);
  });
});
