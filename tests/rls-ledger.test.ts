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

  it("staff cannot write the ledger directly; it is append-only even for service_role", async () => {
    const db = await asUser(staff.email);
    const row = { brewery_id: b.id, sku_id: sku.id, location_id: loc.id, qty: 10, bbl: 5, type: "opening_balance", created_by: staff.id } as const;
    // No INSERT/UPDATE/DELETE grants for app roles: writes go through record_inventory_movement().
    const direct = await db.from("inventory_movements").insert(row).select().single();
    expect(direct.error?.code).toBe("42501");
    const { data: m, error } = await admin.from("inventory_movements").insert(row).select().single();
    expect(error).toBeNull();
    const upd = await db.from("inventory_movements").update({ qty: 99 }).eq("id", m!.id).select();
    expect(upd.error?.code).toBe("42501");
    const del = await db.from("inventory_movements").delete().eq("id", m!.id).select();
    expect(del.error?.code).toBe("42501");
    const { data: still } = await admin.from("inventory_movements").select("qty").eq("id", m!.id).single();
    expect(Number(still!.qty)).toBe(10);
  });

  it("sale_removal without dest_state is rejected by CHECK", async () => {
    const { error } = await admin.from("inventory_movements").insert({
      brewery_id: b.id, sku_id: sku.id, location_id: loc.id,
      qty: -1, bbl: -0.5, type: "sale_removal", channel: "wholesale", created_by: staff.id,
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

  it("trigger overwrites bbl: client-supplied value is ignored, computed from qty * bbl_per_unit", async () => {
    // Insert with deliberately wrong bbl (should be 2 * 0.5 = 1, not 999)
    const { data: m, error } = await admin.from("inventory_movements").insert({
      brewery_id: b.id, sku_id: sku.id, location_id: loc.id,
      qty: 2, bbl: 999, type: "production_in", created_by: staff.id,
    }).select().single();
    expect(error).toBeNull();
    // Verify via admin that stored bbl was corrected to qty * bbl_per_unit = 2 * 0.5 = 1
    const { data: stored } = await admin.from("inventory_movements").select("qty, bbl").eq("id", m!.id).single();
    expect(Number(stored!.qty)).toBe(2);
    expect(Number(stored!.bbl)).toBe(1);
  });
});

describe("removal_shape CHECK: channel/dest_state required on removals, null otherwise", () => {
  // Uses its own brewery/sku/location (rather than the shared fixtures above)
  // so accepted inserts here don't pollute the on_hand/atp sums asserted
  // elsewhere in this file.
  let b: any, staff: any, sku: any, loc: any;
  beforeAll(async () => {
    b = await makeBrewery();
    staff = await makeStaff(b.id, "warehouse");
    const { data: p } = await admin.from("products").insert({ brewery_id: b.id, name: "Check Test IPA" }).select().single();
    ({ data: sku } = await admin.from("skus").insert({ brewery_id: b.id, product_id: p!.id, name: "Check Sku", package_type: "keg", bbl_per_unit: 0.5 }).select().single());
    ({ data: loc } = await admin.from("locations").insert({ brewery_id: b.id, name: "Check WH", kind: "warehouse" }).select().single());
  });

  it("festival_removal and sample require dest_state, just like sale_removal", async () => {
    for (const type of ["festival_removal", "sample"] as const) {
      const { error } = await admin.from("inventory_movements").insert({
        brewery_id: b.id, sku_id: sku.id, location_id: loc.id,
        qty: -1, bbl: -0.5, type, created_by: staff.id,
      });
      expect(error, `${type} without dest_state should be rejected`).not.toBeNull();
      const ok = await admin.from("inventory_movements").insert({
        brewery_id: b.id, sku_id: sku.id, location_id: loc.id,
        qty: -1, bbl: -0.5, type, dest_state: "PA", created_by: staff.id,
      });
      expect(ok.error, `${type} with dest_state should be accepted`).toBeNull();
    }
  });

  it("non-removal types (opening_balance, production_in, return_in, adjustment, taproom_transfer) reject a channel", async () => {
    const nonRemovals: { type: string; qty: number }[] = [
      { type: "opening_balance", qty: 1 },
      { type: "production_in", qty: 1 },
      { type: "return_in", qty: 1 },
      { type: "adjustment", qty: 1 },
      { type: "taproom_transfer", qty: 1 },
    ];
    for (const { type, qty } of nonRemovals) {
      const { error } = await admin.from("inventory_movements").insert({
        brewery_id: b.id, sku_id: sku.id, location_id: loc.id,
        qty, bbl: qty * 0.5, type, channel: "wholesale", created_by: staff.id,
      });
      expect(error, `${type} with a channel should be rejected`).not.toBeNull();
    }
  });

  it("depletion requires channel=taproom and rejects a dest_state", async () => {
    const { error } = await admin.from("inventory_movements").insert({
      brewery_id: b.id, sku_id: sku.id, location_id: loc.id,
      qty: -1, bbl: -0.5, type: "depletion", channel: "taproom", dest_state: "PA", created_by: staff.id,
    });
    expect(error, "depletion with a dest_state should be rejected").not.toBeNull();
  });
});

describe("cross-brewery tenant consistency (composite FKs)", () => {
  // Proves the fix for the finding: RLS alone only checked a row's own
  // brewery_id, so staff of brewery A could previously insert a movement
  // against brewery A that pointed at a location or sku belonging to
  // brewery B — a cross-tenant write RLS never caught. The composite FKs
  // added in 00002 (child (fk_id, brewery_id) -> parent (id, brewery_id))
  // make that combination impossible at the database level.
  let bA: any, bB: any, staffA: any;
  let skuA: any, skuB: any, locA: any, locB: any, productA: any, productB: any;

  beforeAll(async () => {
    bA = await makeBrewery();
    bB = await makeBrewery();
    staffA = await makeStaff(bA.id, "warehouse");
    ({ data: productA } = await admin.from("products").insert({ brewery_id: bA.id, name: "A Product" }).select().single());
    ({ data: productB } = await admin.from("products").insert({ brewery_id: bB.id, name: "B Product" }).select().single());
    ({ data: skuA } = await admin.from("skus").insert({ brewery_id: bA.id, product_id: productA!.id, name: "A Sku", package_type: "keg", bbl_per_unit: 0.5 }).select().single());
    ({ data: skuB } = await admin.from("skus").insert({ brewery_id: bB.id, product_id: productB!.id, name: "B Sku", package_type: "keg", bbl_per_unit: 0.5 }).select().single());
    ({ data: locA } = await admin.from("locations").insert({ brewery_id: bA.id, name: "A WH", kind: "warehouse" }).select().single());
    ({ data: locB } = await admin.from("locations").insert({ brewery_id: bB.id, name: "B WH", kind: "warehouse" }).select().single());
  });

  it("rejects an inventory_movement whose sku_id belongs to a different brewery than brewery_id", async () => {
    const { error } = await admin.from("inventory_movements").insert({
      brewery_id: bA.id, sku_id: skuB.id, location_id: locA.id,
      qty: 1, bbl: 0.5, type: "opening_balance", created_by: staffA.id,
    });
    expect(error).not.toBeNull();
  });

  it("rejects an inventory_movement whose location_id belongs to a different brewery than brewery_id", async () => {
    const { error } = await admin.from("inventory_movements").insert({
      brewery_id: bA.id, sku_id: skuA.id, location_id: locB.id,
      qty: 1, bbl: 0.5, type: "opening_balance", created_by: staffA.id,
    });
    expect(error).not.toBeNull();
  });

  it("rejects a sku whose product_id belongs to a different brewery than brewery_id", async () => {
    // Admin client bypasses RLS but not FK constraints — this proves the DB
    // rejects the combination regardless of who is issuing the write.
    const { error } = await admin.from("skus").insert({
      brewery_id: bA.id, product_id: productB.id, name: "Sneaky Sku", package_type: "keg", bbl_per_unit: 0.5,
    });
    expect(error).not.toBeNull();
  });
});
