// tests/formats.test.ts — a format is the physical shape and the only place
// bbl_per_unit is typed (schema §16.2); packaged formats hold stock, poured
// ones are a ratio back to a keg and hold none.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let ctx: Ctx;
beforeAll(async () => { ctx = await makeStaffCtx((await makeBrewery()).id, "admin"); });

describe("formats", () => {
  it("an atomic packaged format stores bbl_per_unit; a poured format does not; names are unique per brewery", async () => {
    const half = await runCommand("upsert_format", {
      name: "½ bbl keg", basis: "packaged", packageType: "keg", kegSize: "half_bbl", bblPerUnit: 0.5,
    }, ctx) as { id: string; bbl_per_unit: string };
    expect(Number(half.bbl_per_unit)).toBe(0.5);
    const pint = await runCommand("upsert_format", { name: "16 oz pour", basis: "poured" }, ctx) as { id: string; bbl_per_unit: string | null };
    expect(pint.bbl_per_unit).toBeNull();
    // packaged with a typed volume must be positive; poured must not carry one
    await expect(runCommand("upsert_format", { name: "bad", basis: "poured", bblPerUnit: 0.01 }, ctx)).rejects.toBeTruthy();
    // upsert by id renames in place
    const renamed = await runCommand("upsert_format", { id: half.id, name: "½ bbl", basis: "packaged", packageType: "keg", kegSize: "half_bbl", bblPerUnit: 0.5 }, ctx) as { id: string; name: string };
    expect(renamed).toMatchObject({ id: half.id, name: "½ bbl" });
    const list = await runCommand("list_formats", {}, ctx) as { name: string; basis: string }[];
    expect(list.map((f) => f.name).sort()).toEqual(["16 oz pour", "½ bbl"].sort());
    const sales = await makeStaffCtx(ctx.breweryId, "warehouse");
    await expect(runCommand("upsert_format", { name: "x", basis: "poured" }, sales)).rejects.toMatchObject({ code: "permission_denied" });
  });
});

describe("format_components", () => {
  it("a case of six four-packs derives 6 × child bbl; a sku on it freezes that volume; cycles and second levels are rejected", async () => {
    const four = await runCommand("upsert_format", { name: "4pk 16oz", basis: "packaged", packageType: "can", bblPerUnit: 0.002 }, ctx) as { id: string };
    const caseFmt = await runCommand("upsert_format", { name: "case 24×16oz", basis: "packaged", packageType: "can" }, ctx) as { id: string };
    const { data: brand } = await admin.from("brands").insert({ brewery_id: ctx.breweryId, name: "Comp IPA" }).select("id").single();
    await expect(runCommand("create_sku", { brandId: brand!.id, formatId: caseFmt.id }, ctx)).rejects.toThrow(/no volume/);
    const derived = await runCommand("replace_format_components", { formatId: caseFmt.id, components: [{ childFormatId: four.id, qty: 6 }] }, ctx) as { bbl_per_unit: string; composed: boolean };
    expect(Number(derived.bbl_per_unit)).toBeCloseTo(0.012, 6);
    expect(derived.composed).toBe(true);
    const sku = await runCommand("create_sku", { brandId: brand!.id, formatId: caseFmt.id }, ctx) as { id: string };
    const { data: loc } = await admin.from("locations").insert({ brewery_id: ctx.breweryId, name: "Comp WH", kind: "warehouse" }).select("id").single();
    const { data: bin } = await admin.from("bins").insert({ brewery_id: ctx.breweryId, location_id: loc!.id, name: "Cold" }).select("id").single();
    const { data: mv } = await admin.from("inventory_movements").insert({ brewery_id: ctx.breweryId, sku_id: sku.id, location_id: loc!.id, bin_id: bin!.id, qty: 10, type: "opening_balance", created_by: ctx.userId }).select("bbl").single();
    expect(Number(mv!.bbl)).toBeCloseTo(0.12, 6);
    await expect(runCommand("replace_format_components", { formatId: four.id, components: [{ childFormatId: caseFmt.id, qty: 1 }] }, ctx)).rejects.toThrow(/cycle|one level|derives/i);
    await expect(runCommand("replace_format_components", { formatId: caseFmt.id, components: [{ childFormatId: caseFmt.id, qty: 1 }] }, ctx)).rejects.toThrow(/cycle|one level/i);
  });
});

describe("format_bom", () => {
  it("replace_format_bom writes the format's bill with on_break; sku_bom is gone", async () => {
    const fmt = await runCommand("upsert_format", { name: "BOM case", basis: "packaged", packageType: "can", bblPerUnit: 0.012 }, ctx) as { id: string };
    const mat = async (name: string) => (await admin.from("materials").insert({ brewery_id: ctx.breweryId, name, category: "packaging", base_uom: "each", purchase_uom: "each", lot_tracked: false }).select("id").single()).data!.id as string;
    const tray = await mat("case tray"); const paktech = await mat("PakTech");
    const out = await runCommand("replace_format_bom", { formatId: fmt.id, lines: [{ materialId: tray, qtyPerUnit: 1, onBreak: "return_to_stock" }, { materialId: paktech, qtyPerUnit: 6 }] }, ctx) as { lines: { material_id: string; on_break: string }[] };
    expect(out.lines.map((l) => [l.material_id, l.on_break]).sort()).toEqual([[paktech, "consumed"], [tray, "return_to_stock"]].sort());
    const { error } = await admin.from("sku_bom").select("*").limit(1);
    expect(error?.code).toBe("PGRST205");
  });
});
