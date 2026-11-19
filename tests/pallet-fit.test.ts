// tests/pallet-fit.test.ts — palletFit groups order lines by physical package
// and says how full each pallet unit is; palletHint is the phone bar's nudge.
import { describe, expect, it } from "vitest";
import { palletFit, palletHint, type PalletLine } from "../lib/mgr/pallet-fit";

const sixtel = (qty: number, palletFit: number | null = 20): PalletLine => ({ qty, packageType: "keg", kegSize: "sixth_bbl", unitsPerCase: null, palletFit });
const half = (qty: number): PalletLine => ({ qty, packageType: "keg", kegSize: "half_bbl", unitsPerCase: null, palletFit: 8 });
const caseOf24 = (qty: number): PalletLine => ({ qty, packageType: "can", kegSize: null, unitsPerCase: 24, palletFit: 10 });

describe("palletFit", () => {
  it("adds lines of one physical package across brands, and reads an exact fit as full", () => {
    // Two brands' sixtels, one of them one-way: the same keg on the pallet.
    expect(palletFit([sixtel(25), sixtel(15)])).toEqual([
      { key: "keg|sixth_bbl|20", label: "⅙ bbl kegs", count: 40, fit: 20, full: 2, remainder: 0, toFill: 0, text: "2 full ✓" },
    ]);
  });

  it("names full units, the partial one, and what fills it", () => {
    expect(palletFit([caseOf24(13), half(3)])).toEqual([
      { key: "can|24|10", label: "Cases of 24 cans", count: 13, fit: 10, full: 1, remainder: 3, toFill: 7, text: "1 full + 3 · 7 to fill" },
      { key: "keg|half_bbl|8", label: "½ bbl kegs", count: 3, fit: 8, full: 0, remainder: 3, toFill: 5, text: "3 · 5 to fill" },
    ]);
  });

  it("skips formats with no pallet fit and lines with no quantity", () => {
    expect(palletFit([sixtel(4, null), half(0)])).toEqual([]);
  });

  it("keeps one package with two different fits apart, and tells the groups apart", () => {
    expect(palletFit([sixtel(5, 20), sixtel(5, 16)]).map((g) => [g.label, g.text])).toEqual([
      ["⅙ bbl kegs (20 a unit)", "5 · 15 to fill"],
      ["⅙ bbl kegs (16 a unit)", "5 · 11 to fill"],
    ]);
  });
});

describe("palletHint", () => {
  it("nudges only when a partial unit is within a fifth of filling, closest first", () => {
    expect(palletHint(palletFit([sixtel(18), half(7)]))).toBe("½ bbl kegs 1 short of full");
    expect(palletHint(palletFit([sixtel(18)]))).toBe("⅙ bbl kegs 2 short of full");
    expect(palletHint(palletFit([sixtel(15), sixtel(20, 20)]))).toBeUndefined();
    expect(palletHint(palletFit([sixtel(40)]))).toBeUndefined();
  });
});
