// tests/formats.test.ts — a format is the physical shape and the only place
// bbl_per_unit is typed (schema §16.2); packaged formats hold stock, poured
// ones are a ratio back to a keg and hold none.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedLocation } from "./helpers";
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
    const { id: locId, binId } = await seedLocation(ctx.breweryId, { name: "Comp WH" });
    const { data: mv } = await admin.from("inventory_movements").insert({ brewery_id: ctx.breweryId, sku_id: sku.id, location_id: locId, bin_id: binId, qty: 10, type: "opening_balance", created_by: ctx.userId }).select("bbl").single();
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

describe("format editing detail", () => {
  it("loads complete replacement sets and minimal material options for Sales, with tenant and role boundaries", async () => {
    const child = await runCommand("upsert_format", { name: "Detail can", basis: "packaged", packageType: "can", bblPerUnit: 0.004 }, ctx) as { id: string };
    const parent = await runCommand("upsert_format", { name: "Detail case", basis: "packaged", packageType: "can" }, ctx) as { id: string };
    const { data: material, error } = await admin.from("materials").insert({ brewery_id: ctx.breweryId, name: "Detail tray", category: "packaging", base_uom: "each", purchase_uom: "each", lot_tracked: false, active: false }).select("id").single();
    expect(error).toBeNull();
    await runCommand("replace_format_components", { formatId: parent.id, components: [{ childFormatId: child.id, qty: 24 }] }, ctx);
    await runCommand("replace_format_bom", { formatId: parent.id, lines: [{ materialId: material!.id, qtyPerUnit: 1, onBreak: "return_to_stock" }] }, ctx);
    const sales = await makeStaffCtx(ctx.breweryId, "sales");
    const detail = await runCommand("get_format_composition", { formatId: parent.id }, sales) as { format: { id: string }; components: { child_format_id: string; qty: number }[]; lines: { material_id: string; qty_per_unit: number; on_break: string }[]; materials: Record<string, unknown>[]; usedAsChild: boolean };
    expect(detail.format.id).toBe(parent.id);
    expect(detail.components).toEqual([{ child_format_id: child.id, qty: 24 }]);
    expect(detail.lines).toEqual([{ material_id: material!.id, qty_per_unit: 1, on_break: "return_to_stock" }]);
    expect(detail.materials.find((m) => m.id === material!.id)).toEqual({ id: material!.id, name: "Detail tray", base_uom: "each", active: false });
    expect(detail.usedAsChild).toBe(false);
    expect(await runCommand("get_format_composition", { formatId: child.id }, sales)).toMatchObject({ usedAsChild: true });
    await expect(runCommand("list_materials", {}, sales)).rejects.toMatchObject({ code: "permission_denied" });
    const warehouse = await makeStaffCtx(ctx.breweryId, "warehouse");
    await expect(runCommand("get_format_composition", { formatId: parent.id }, warehouse)).resolves.toMatchObject({ format: { id: parent.id } });
    const outsider = await makeStaffCtx((await makeBrewery()).id, "admin");
    await expect(runCommand("get_format_composition", { formatId: parent.id }, outsider)).rejects.toMatchObject({ code: "not_found" });
    await expect(runCommand("get_format_composition", { formatId: parent.id }, { ...sales, role: "brewer" })).rejects.toMatchObject({ code: "permission_denied" });
    await expect(runCommand("get_format_composition", { formatId: parent.id }, { ...sales, role: "customer" })).rejects.toMatchObject({ code: "permission_denied" });
    await expect(runCommand("get_format_composition", { formatId: "bad" }, sales)).rejects.toMatchObject({ code: "invalid_input" });
    await runCommand("replace_format_components", { formatId: parent.id, components: [] }, sales);
    await runCommand("replace_format_bom", { formatId: parent.id, lines: [] }, sales);
    await expect(runCommand("get_format_composition", { formatId: parent.id }, sales)).resolves.toMatchObject({ components: [], lines: [] });
  });
});

describe("large format replacement sets", () => {
  it("loads and saves every component, BOM line, and option beyond the API row cap", async () => {
    const large = await makeStaffCtx((await makeBrewery()).id, "admin");
    const parent = await runCommand("upsert_format", { name: "Large case", basis: "packaged", packageType: "can" }, large) as { id: string };
    const children = Array.from({ length: 1001 }, (_, n) => ({ id: crypto.randomUUID(), brewery_id: large.breweryId, name: `Child ${n.toString().padStart(4, "0")}`, basis: "packaged", package_type: "can", bbl_per_unit: 0.001 }));
    const materials = children.map((_, n) => ({ id: crypto.randomUUID(), brewery_id: large.breweryId, name: `Material ${n.toString().padStart(4, "0")}`, category: "packaging", base_uom: "each", purchase_uom: "each", lot_tracked: false }));
    expect((await admin.from("formats").insert(children)).error).toBeNull();
    expect((await admin.from("materials").insert(materials)).error).toBeNull();
    expect((await admin.from("format_components").insert(children.map((c) => ({ brewery_id: large.breweryId, parent_format_id: parent.id, child_format_id: c.id, qty: 1 })))).error).toBeNull();
    expect((await admin.from("format_bom").insert(materials.map((m) => ({ brewery_id: large.breweryId, format_id: parent.id, material_id: m.id, qty_per_unit: 1, on_break: "return_to_stock" })))).error).toBeNull();
    type LargeDetail = { components: { child_format_id: string; qty: number }[]; lines: { material_id: string; qty_per_unit: number; on_break: string }[]; formats: { id: string }[]; materials: { id: string }[] };
    const detail = await runCommand("get_format_composition", { formatId: parent.id }, large) as LargeDetail;
    expect(detail.components).toHaveLength(1001);
    expect(detail.lines).toHaveLength(1001);
    expect(detail.formats).toHaveLength(1002);
    expect(detail.materials).toHaveLength(1001);
    expect(new Set(detail.formats.map((f) => f.id))).toEqual(new Set([parent.id, ...children.map((c) => c.id)]));
    expect(new Set(detail.materials.map((m) => m.id))).toEqual(new Set(materials.map((m) => m.id)));
    await runCommand("replace_format_components", { formatId: parent.id, components: detail.components.map((c) => ({ childFormatId: c.child_format_id, qty: c.qty })) }, large);
    await runCommand("replace_format_bom", { formatId: parent.id, lines: detail.lines.map((l) => ({ materialId: l.material_id, qtyPerUnit: l.qty_per_unit, onBreak: l.on_break })) }, large);
    const reloaded = await runCommand("get_format_composition", { formatId: parent.id }, large) as LargeDetail;
    expect(reloaded.components).toEqual(detail.components);
    expect(reloaded.lines).toEqual(detail.lines);
  });
});
