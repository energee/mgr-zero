// tests/pallet-fit.test.ts — palletFit groups order lines by physical package
// and says how full each pallet unit is; palletHint is the phone bar's nudge.
import { describe, expect, it } from "vitest";
import { palletRulesCommand, toPalletRulesValues } from "../lib/mgr/pallet-rules-view";
import { DEFAULT_PALLET_RULES, palletCount, palletFit, palletHint, palletLoad, type PalletLine } from "../lib/mgr/pallet-fit";

const sixtel = (qty: number, palletFit: number | null = 20): PalletLine => ({ qty, packageType: "keg", kegSize: "sixth_bbl", unitsPerCase: null, palletFit, unitLb: 58, heightIn: 23.5 });
const half = (qty: number): PalletLine => ({ qty, packageType: "keg", kegSize: "half_bbl", unitsPerCase: null, palletFit: 8, palletFitMixed: 6, unitLb: 160, heightIn: 23.5 });
const caseOf24 = (qty: number): PalletLine => ({ qty, packageType: "can", kegSize: null, unitsPerCase: 24, palletFit: 10, unitLb: 27, heightIn: 6.1 });

describe("palletFit", () => {
  it("adds lines of one physical package across brands, and reads an exact fit as full", () => {
    // Two brands' sixtels, one of them one-way: the same keg on the pallet.
    expect(palletFit([sixtel(25), sixtel(15)])).toEqual([
      { key: "keg|sixth_bbl|20", label: "⅙ bbl kegs", count: 40, fit: 20, full: 2, remainder: 0, toFill: 0, text: "2 full ✓" },
    ]);
  });

  it("names full units and how far the partial one is filled", () => {
    expect(palletFit([caseOf24(13), half(3)])).toEqual([
      { key: "can|24|10", label: "Cases of 24 cans", count: 13, fit: 10, full: 1, remainder: 3, toFill: 7, text: "1 full + 3 of 10" },
      { key: "keg|half_bbl|8", label: "½ bbl kegs", count: 3, fit: 8, full: 0, remainder: 3, toFill: 5, text: "3 of 8" },
    ]);
  });

  it("skips formats with no pallet fit and lines with no quantity", () => {
    expect(palletFit([sixtel(4, null), half(0)])).toEqual([]);
  });

  it("keeps one package with two different fits apart, and tells the groups apart", () => {
    expect(palletFit([sixtel(5, 20), sixtel(5, 16)]).map((g) => [g.label, g.text])).toEqual([
      ["⅙ bbl kegs (20 a unit)", "5 of 20"],
      ["⅙ bbl kegs (16 a unit)", "5 of 16"],
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

describe("palletLoad", () => {
  const pallets = (...lines: PalletLine[]) => palletLoad(lines)?.pallets;
  it("stacks two keg tiers, or one keg tier under five case layers, or eight case layers", () => {
    expect(pallets(half(8))).toBe(1);
    expect(pallets(half(8), sixtel(20))).toBe(1);
    expect(pallets(sixtel(40))).toBe(1);
    expect(pallets(sixtel(41))).toBe(2);
    expect(pallets(sixtel(20), caseOf24(50))).toBe(2); // 2,510 lb: over the weight limit
    expect(pallets(sixtel(19), caseOf24(50))).toBe(1);
    expect(pallets(half(6), caseOf24(51))).toBe(2);
    expect(pallets(caseOf24(80))).toBe(1);
    expect(pallets(caseOf24(81))).toBe(2);
    expect(palletLoad([half(0)])).toBeUndefined();
  });
  it("counts a half as a sixth of a tier once a sixtel shares it", () => {
    expect(pallets(half(5), sixtel(2), caseOf24(40))).toBe(1); // one mixed tier under four case layers
    expect(pallets(half(4), sixtel(6), caseOf24(40))).toBe(1);
    expect(pallets(half(4), sixtel(7), caseOf24(40))).toBe(2); // the kegs need a second tier, so the cases need a second pallet
    expect(pallets(half(16), sixtel(1))).toBe(2); // two full tiers of halves, then a third tier
  });
  it("keeps eight halves on eight halves off one pallet by weight", () => {
    expect(pallets(half(16))).toBe(2);
    expect(pallets(half(12))).toBe(1);
  });
  it("says how many more of each package ride on the same pallets", () => {
    const load = palletLoad([half(5), sixtel(2)], [half(0), sixtel(0), caseOf24(0)]);
    expect(load?.room.map((r) => [r.label, r.more])).toEqual([["½ bbl kegs", 8], ["⅙ bbl kegs", 21], ["Cases of 24 cans", 50]]);
    expect(load?.text).toBe("1 pallet. Room for 8 more ½ bbl kegs, 21 more ⅙ bbl kegs or 50 more cases of 24 cans.");
    expect(palletLoad([caseOf24(80)], [caseOf24(0)])?.text).toBe("1 full pallet ✓");
    expect(palletLoad([caseOf24(79), sixtel(0)], [sixtel(0), caseOf24(0)])?.text).toBe("1 pallet. Room for 1 more case of 24 cans.");
    expect(palletLoad([half(7), caseOf24(40)], [half(0)])?.text).toBe("1 pallet. Room for 1 more ½ bbl keg.");
  });
  it("stacks by height: shorter cases add layers, and cases ride on two keg layers when there is room", () => {
    const short = (qty: number): PalletLine => ({ ...caseOf24(qty), heightIn: 5, unitLb: 10 });
    expect(pallets(short(100))).toBe(1); // 54.5 in of room takes ten 5 in layers
    expect(pallets(short(101))).toBe(2);
    expect(pallets(sixtel(40), caseOf24(6))).toBe(1); // two keg layers leave 7.5 in: one layer of cases
    expect(pallets(sixtel(40), short(11))).toBe(2); // a second layer of cases does not fit above them
    expect(palletCount([half(8), caseOf24(50)], { ...DEFAULT_PALLET_RULES, maxHeightIn: 48 })).toBe(2); // a lower limit takes three case layers on the kegs, not five
    expect(pallets({ ...short(90), heightIn: null })).toBe(1); // a case with no height is held only by weight
  });
  it("loads keg layers by the brewery's table when it has one", () => {
    const rules = { ...DEFAULT_PALLET_RULES, kegLayers: [{ half_bbl: 6, sixth_bbl: 6 }, { half_bbl: 5, sixth_bbl: 2 }, { half_bbl: 3, sixth_bbl: 10 }] };
    const count = (...lines: PalletLine[]) => palletCount(lines, rules);
    expect(count(half(6), sixtel(6), caseOf24(40))).toBe(1); // one table row, under four case layers
    expect(count(half(6), sixtel(7), caseOf24(40))).toBe(2); // a seventh sixtel starts a second keg layer
    expect(count(half(8), caseOf24(40))).toBe(1); // a size alone still loads by its own pallet fit
    expect(count(half(9), sixtel(16))).toBe(1); // 6 + 6 under 3 + 10
    expect(palletLoad([half(5), sixtel(2), caseOf24(50)], [half(0), sixtel(0)], rules)?.text).toBe("1 pallet. Room for 1 more ½ bbl keg or 4 more ⅙ bbl kegs.");
  });
  it("counts weight for a line with no pallet fit, and a higher weight limit carries more", () => {
    const loose = { ...caseOf24(60), palletFit: null }; // 1,620 lb with no layer of its own
    expect(palletCount([sixtel(20), loose])).toBe(2);
    expect(palletCount([sixtel(20), loose], { ...DEFAULT_PALLET_RULES, maxLb: 3000 })).toBe(1);
    expect(palletCount([loose])).toBe(0);
  });
});

describe("pallet rules form", () => {
  const saved = toPalletRulesValues({ ...DEFAULT_PALLET_RULES, kegLayers: [{ half_bbl: 6, sixth_bbl: 6 }] });
  it("reads the rules as text and withholds Save until something valid changed", () => {
    expect(saved).toEqual({ maxLb: "2500", maxHeightIn: "60", palletHeightIn: "5.5", kegLayers: [{ half_bbl: "6", sixth_bbl: "6" }] });
    expect(palletRulesCommand(saved, saved).reason).toBe("Still needed: a change to the pallet rules.");
    expect(palletRulesCommand({ ...saved, maxLb: "0" }, saved).reason).toBe("Still needed: a pallet weight from 1 to 10,000 lb.");
    expect(palletRulesCommand({ ...saved, kegLayers: [...saved.kegLayers, {}] }, saved).reason).toBe("Still needed: a whole number of kegs in every keg layer.");
  });
  it("sends counts as numbers and leaves out blank and zero cells", () => {
    const command = palletRulesCommand({ ...saved, maxLb: "2200", kegLayers: [{ half_bbl: "8", sixth_bbl: "" }, { half_bbl: "0", sixth_bbl: "20" }] }, saved);
    expect(command.reason).toBeNull();
    expect(command.input).toEqual({ maxLb: 2200, maxHeightIn: 60, palletHeightIn: 5.5, kegLayers: [{ half_bbl: 8 }, { sixth_bbl: 20 }] });
  });
});

describe("pallet advice on a large order", () => {
  const table = () => [[8, 0], [6, 6], [6, 0], [5, 2], [4, 6], [3, 10], [2, 12], [1, 14], [0, 20]].map(([h, s]) => ({ half_bbl: h, sixth_bbl: s }));
  const order = [half(120), sixtel(200), caseOf24(100)];
  it("reports room after about one solve of the keg layers, not one per unit counted", () => {
    // Each fresh table starts with nothing remembered, so the two timings compare like with like.
    let start = performance.now();
    const pallets = palletCount(order, { ...DEFAULT_PALLET_RULES, kegLayers: table() });
    const oneSolve = performance.now() - start;
    start = performance.now();
    const load = palletLoad(order, order, { ...DEFAULT_PALLET_RULES, kegLayers: table() });
    const withRoom = performance.now() - start;
    expect(load?.pallets).toBe(pallets);
    // Counting up one unit at a time re-solved the layers dozens of times; the cart froze on every keystroke.
    expect(withRoom).toBeLessThan(15 * oneSolve + 100);
  });
});
