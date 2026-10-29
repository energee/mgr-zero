// tests/material-count-sheet.test.ts — the pure helpers behind a material
// count (#1583): which materials a Count sheet lists in a bin, which lines a
// count sends, and how each line reads before and after its preview.
import { describe, expect, it } from "vitest";
import { countLines, countLineView, materialsHeldAt, type MaterialCountPreview } from "@/lib/mgr/cycle-count-view";

const cans = { id: "cans", name: "Cans · 16 oz", uom: "each" };
const lids = { id: "lids", name: "Lids · 202", uom: "each" };
const salt = { id: "salt", name: "Gypsum", uom: "g" };

describe("materialsHeldAt", () => {
  const onHand = [
    { material_id: "cans", location_id: "wh", bin_id: "shelf", qty: 3100 },
    { material_id: "lids", location_id: "wh", bin_id: "shelf", qty: "0" },
    { material_id: "salt", location_id: "wh", bin_id: "shelf", qty: "-2" },
    { material_id: "lids", location_id: "wh", bin_id: "floor", qty: 40 },
  ];
  it("lists the materials with a nonzero balance in the bin, in list order", () => {
    expect(materialsHeldAt([salt, cans, lids], onHand, "wh", "shelf")).toEqual([salt, cans]);
    expect(materialsHeldAt([salt, cans, lids], onHand, "wh", "floor")).toEqual([lids]);
    expect(materialsHeldAt([salt, cans, lids], onHand, "wh", "")).toEqual([]);
  });
});

describe("countLines", () => {
  it("sends each listed material with a quantity typed, and only those", () => {
    expect(countLines([cans, lids, salt], { cans: "3050", lids: "", gone: "5" })).toEqual([{ materialId: "cans", qty: 3050 }]);
    expect(countLines([cans, lids], { cans: "0", lids: "12.5" })).toEqual([{ materialId: "cans", qty: 0 }, { materialId: "lids", qty: 12.5 }]);
  });
  it("is null when nothing is counted or any count is not zero or more", () => {
    expect(countLines([cans], {})).toBeNull();
    expect(countLines([cans, lids], { cans: "3", lids: "-1" })).toBeNull();
    expect(countLines([cans, lids], { cans: "3", lids: "x" })).toBeNull();
  });
});

describe("countLineView", () => {
  const plan: MaterialCountPreview = { revision: "r1", lines: [{
    material_id: "cans", material_name: "Cans · 16 oz", base_uom: "each", qty_expected: 3100, qty_counted: 3050,
    adjustments: [{ lot_id: "lot-1", lot_code: "L-0774", qty_expected: 3100, qty_counted: 3050, delta: -50 }],
  }] };
  it("names an uncounted line's system quantity only", () => {
    expect(countLineView(lids, "", 40, plan)).toEqual({ key: "lids", material: "Lids · 202", qty: "", units: ["each"], unitIndex: 0, preview: "system 40 · not counted", adjustments: undefined });
  });
  it("asks for a preview until the count is previewed", () => {
    expect(countLineView(cans, "3050", 3100, null).preview).toBe("system 3,100 · variance -50 · preview before recording");
    expect(countLineView(cans, "3150.5", 3100, null).preview).toBe("system 3,100 · variance +50.5 · preview before recording");
  });
  it("shows the previewed system quantity and each lot's signed adjustment", () => {
    expect(countLineView(cans, "3050", 9, plan)).toEqual({
      key: "cans", material: "Cans · 16 oz", qty: "3050", units: ["each"], unitIndex: 0,
      preview: "system 3,100 · variance -50 · reviewed against current stock",
      adjustments: [{ key: "lot-1", lot: "L-0774", expected: 3100, counted: 3050, delta: -50, unit: "each" }],
    });
  });
});
