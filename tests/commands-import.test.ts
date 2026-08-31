// tests/commands-import.test.ts — TDD spec for the import_csv command (Task 9).
import { describe, it, expect, beforeAll } from "vitest";
import { makeBrewery, makeStaff, asUser, admin } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

describe("import_csv", () => {
  let ctx: any, b: any;
  beforeAll(async () => {
    b = await makeBrewery();
    const staff = await makeStaff(b.id, "admin");
    const db = await asUser(staff.email);
    const { data: { user } } = await db.auth.getUser();
    ctx = { db, userId: user!.id, breweryId: b.id, role: "admin" };
    await admin.from("locations").insert({ brewery_id: b.id, name: "WH", kind: "warehouse" });
  });

  it("imports products+skus then opening balances; bad rows reported not fatal", async () => {
    const r1 = await runCommand("import_csv", { kind: "products_skus", rows: [
      { product: "Hazy IPA", style: "IPA", abv: "6.5", sku_name: "1/2 bbl keg", package_type: "keg", units_per_case: "", bbl_per_unit: "0.5" },
      { product: "Hazy IPA", style: "IPA", abv: "6.5", sku_name: "16oz 4-pack", package_type: "can", units_per_case: "6", bbl_per_unit: "0.01612903" },
    ] }, ctx);
    expect(r1.inserted).toBe(2);
    const r2 = await runCommand("import_csv", { kind: "opening_balances", rows: [
      { sku_name: "1/2 bbl keg", location: "WH", qty: "24" },
      { sku_name: "does-not-exist", location: "WH", qty: "5" },
    ] }, ctx);
    expect(r2.inserted).toBe(1);
    expect(r2.errors).toHaveLength(1);
    const oh = await runCommand("get_on_hand", {}, ctx);
    expect(oh.some((r: any) => Number(r.qty) === 24)).toBe(true);
  });

  it("rejects a non-numeric abv instead of silently nulling it", async () => {
    const r = await runCommand("import_csv", { kind: "products_skus", rows: [
      { product: "Bad ABV Ale", style: "Pale", abv: "n/a", sku_name: "6-pack", package_type: "can", units_per_case: "4", bbl_per_unit: "0.05" },
    ] }, ctx);
    expect(r.inserted).toBe(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/abv/i);
    const { data: product } = await ctx.db.from("products").select("id").eq("brewery_id", b.id).eq("name", "Bad ABV Ale").maybeSingle();
    expect(product).toBeNull();
  });

  it("rejects a qty of 0 for opening balances with a clean error", async () => {
    const r = await runCommand("import_csv", { kind: "opening_balances", rows: [
      { sku_name: "1/2 bbl keg", location: "WH", qty: "0" },
    ] }, ctx);
    expect(r.inserted).toBe(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/qty/i);
  });
});
