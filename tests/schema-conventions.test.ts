// tests/schema-conventions.test.ts — proves the baseline-migration conventions hold by
// writing to the live local database: composite tenant FKs, lot-tracking trigger, and
// append-only ledgers (UPDATE/DELETE revoked). See docs/superpowers/specs/2026-08-31-mgr-schema-design.md §0.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaff, asUser } from "./helpers";

async function seed() {
  const b = await makeBrewery();
  const staff = await makeStaff(b.id);
  const db = await asUser(staff.email);
  const mk = async <T,>(table: string, row: Record<string, unknown>): Promise<T> => {
    const { data, error } = await admin.from(table).insert(row).select().single();
    if (error) throw new Error(`${table}: ${error.message}`);
    return data as T;
  };
  const tracked = await mk<{ id: string }>("materials", {
    brewery_id: b.id, name: "Citra", category: "hop", base_uom: "lb", purchase_uom: "lb", lot_tracked: true,
  });
  const untracked = await mk<{ id: string }>("materials", {
    brewery_id: b.id, name: "Gypsum", category: "chemical", base_uom: "g", purchase_uom: "kg", lot_tracked: false,
  });
  const lot = await mk<{ id: string }>("material_lots", { brewery_id: b.id, material_id: tracked.id, lot_code: "L1" });
  const pool = await mk<{ id: string }>("keg_pools", { brewery_id: b.id, name: "Owned", kind: "owned" });
  return { b, staff, db, tracked, untracked, lot, pool };
}

describe("schema conventions (live DB)", () => {
  let s: Awaited<ReturnType<typeof seed>>;
  beforeAll(async () => { s = await seed(); });

  it("composite FK: a material_movement cannot reference another brewery's material", async () => {
    const other = await makeBrewery();
    const { error } = await admin.from("material_movements").insert({
      brewery_id: other.id, material_id: s.untracked.id, qty: 5, type: "opening_balance", created_by: s.staff.id,
    });
    expect(error?.code).toBe("23503"); // foreign_key_violation
  });

  it("lot_tracked material: consumption without lot_id is rejected; with lot_id accepted", async () => {
    const base = { brewery_id: s.b.id, material_id: s.tracked.id, qty: -1, type: "consumption", created_by: s.staff.id };
    const { error } = await s.db.from("material_movements").insert(base);
    expect(error?.code).toBe("23514"); // check_violation raised by enforce_material_lot()
    const ok = await s.db.from("material_movements").insert({ ...base, lot_id: s.lot.id });
    expect(ok.error).toBeNull();
  });

  it("untracked material: a lot_id is rejected", async () => {
    const { error } = await s.db.from("material_movements").insert({
      brewery_id: s.b.id, material_id: s.untracked.id, lot_id: s.lot.id, qty: 1, type: "receipt", created_by: s.staff.id,
    });
    // the composite FK (lot_id, material_id) fails before the trigger runs; either way it is rejected
    expect(error).not.toBeNull();
  });

  it("material_movements and keg_events reject UPDATE and DELETE", async () => {
    const { data: mm, error: e1 } = await s.db.from("material_movements")
      .insert({ brewery_id: s.b.id, material_id: s.untracked.id, qty: 100, type: "opening_balance", created_by: s.staff.id })
      .select().single();
    expect(e1).toBeNull();
    const { data: ke, error: e2 } = await s.db.from("keg_events")
      .insert({ brewery_id: s.b.id, pool_id: s.pool.id, keg_size: "half_bbl", qty: 10, reason: "acquired", created_by: s.staff.id })
      .select().single();
    expect(e2).toBeNull();

    for (const [table, id] of [["material_movements", mm.id], ["keg_events", ke.id]] as const) {
      const upd = await s.db.from(table).update({ note: "tamper" }).eq("id", id);
      expect(upd.error?.code, `${table} update`).toBe("42501"); // insufficient_privilege
      const del = await s.db.from(table).delete().eq("id", id);
      expect(del.error?.code, `${table} delete`).toBe("42501");
      const { data: still } = await s.db.from(table).select("id, note").eq("id", id).single();
      expect(still).toEqual({ id, note: null });
    }
  });
});
