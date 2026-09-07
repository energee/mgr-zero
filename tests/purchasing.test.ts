// tests/purchasing.test.ts — Program 6: vendors, materials, contracts, POs
// (draft → mark sent → receive), planning drafts, and material cycle counts.
// Lead time lives on the vendor (spec 2026-09-07 §3); a PO status is derived
// from counted receipts and an empty PO never looks received (§2).
import { beforeAll, describe, expect, it } from "vitest";
import { makeBrewery, makeStaffCtx, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let b: { id: string };
let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
beforeAll(async () => {
  b = await makeBrewery();
  ctx = await makeStaffCtx(b.id, "warehouse");
});

describe("schema: lead time and PO status derivation", () => {
  it("lead_time_days lives on vendors; materials has no such column", () => {
    const col = (t: string) => sql(`select column_name from information_schema.columns
      where table_schema='public' and table_name='${t}' and column_name='lead_time_days'`);
    expect(col("vendors")).toEqual(["lead_time_days"]);
    expect(col("materials")).toEqual([]);
  });

  it("a PO with no lines derives no status (the trigger leaves it alone)", () => {
    // bool_and over zero rows is NULL; before the guard that read as partially_received.
    expect(sql(`select private.po_receipt_status('00000000-0000-4000-8000-000000000000'::uuid) is null`)).toEqual(["t"]);
  });
});

describe("vendors, materials, contracts", () => {
  it("creates and edits a vendor, a material with a default vendor, and a contract; the list joins them", async () => {
    const ych = (await runCommand("upsert_vendor", { name: "YCH", email: "orders@ych.example", leadTimeDays: 14 }, ctx)) as { id: string; lead_time_days: number };
    expect(ych.lead_time_days).toBe(14);
    const renamed = (await runCommand("upsert_vendor", { id: ych.id, name: "YCH Hops", leadTimeDays: 10, paymentTerms: "net15" }, ctx)) as { name: string; payment_terms: string };
    expect(renamed).toMatchObject({ name: "YCH Hops", payment_terms: "net15" });

    const citra = (await runCommand("upsert_material", {
      name: "Citra", category: "hop", baseUom: "lb", purchaseUom: "each", purchaseUomFactor: 44, lotTracked: true, defaultVendorId: ych.id,
    }, ctx)) as { id: string; default_vendor_id: string; purchase_uom_factor: number };
    expect(citra.default_vendor_id).toBe(ych.id);

    const contract = (await runCommand("upsert_material_contract", {
      vendorId: ych.id, materialId: citra.id, qtyCommitted: 400, unitCostCents: 1250, contractNo: "Citra 2026",
    }, ctx)) as { id: string };

    const vendors = (await runCommand("list_vendors_and_contracts", {}, ctx)) as {
      id: string; name: string; lead_time_days: number;
      contracts: { id: string; material_id: string; qty_committed: number; qty_received: number; qty_on_order: number; qty_available: number }[];
    }[];
    expect(vendors.map((v) => v.name)).toEqual(["YCH Hops"]);
    expect(vendors[0].contracts).toEqual([{
      id: contract.id, material_id: citra.id, material_name: "Citra", contract_no: "Citra 2026", unit_cost_cents: 1250,
      starts_on: null, ends_on: null, qty_committed: 400, qty_received: 0, qty_on_order: 0, qty_available: 400,
    }]);

    const materials = (await runCommand("list_materials", {}, ctx)) as { id: string; default_vendor_id: string; purchase_uom_factor: number; lot_tracked: boolean }[];
    expect(materials.find((m) => m.id === citra.id)).toMatchObject({ default_vendor_id: ych.id, purchase_uom_factor: 44, lot_tracked: true });
  });

  it("a sales user may not edit vendors", async () => {
    const sales = await makeStaffCtx(b.id, "sales");
    await expect(runCommand("upsert_vendor", { name: "Nope" }, sales)).rejects.toThrow(/permission/i);
  });
});
