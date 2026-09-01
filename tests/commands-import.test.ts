// tests/commands-import.test.ts — import_csv is registered but fails closed
// (audit P1.9): the command must reject before any database write, keep its
// input contract so bad posts are still validation errors, and keep its role
// gate so non-admins see a permission error rather than the block message.
import { describe, it, expect, beforeAll } from "vitest";
import { makeBrewery, makeStaffCtx, admin } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

describe("import_csv (blocked)", () => {
  let ctx: any, salesCtx: any, b: any;
  beforeAll(async () => {
    b = await makeBrewery();
    ctx = await makeStaffCtx(b.id);
    salesCtx = await makeStaffCtx(b.id, "sales");
  });

  it("fails closed for admins before writing anything", async () => {
    await expect(runCommand("import_csv", { kind: "products_skus", rows: [
      { product: "Hazy IPA", style: "IPA", abv: "6.5", sku_name: "1/2 bbl keg", package_type: "keg", units_per_case: "", bbl_per_unit: "0.5" },
    ] }, ctx)).rejects.toThrow(/not available/i);
    const { data } = await admin.from("products").select("id").eq("brewery_id", b.id);
    expect(data).toEqual([]);
  });

  it("still validates input and roles ahead of the block", async () => {
    await expect(runCommand("import_csv", { kind: "nope", rows: [] }, ctx)).rejects.toThrow(/kind/i);
    await expect(runCommand("import_csv", { kind: "customers", rows: [] }, salesCtx)).rejects.toThrow(/permission/i);
  });
});
