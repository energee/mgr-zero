// tests/recipe-ibu.test.ts — the recipe IBU estimate (lib/recipe-ibu.ts): the
// plan's goldens, every row of its text table, and what never counts.
import { describe, expect, it } from "vitest";
import { sgToPlato } from "@/lib/recipe-gravity";
import { ibuText, recipeIbu, type IbuLine } from "@/lib/recipe-ibu";

const OG = sgToPlato(1.05);
const boil = (o: Partial<IbuLine> = {}): IbuLine => ({ name: "Citra", category: "hop", stage: "boil", perBblQty: 1, unit: "lb", timingMinutes: 60, alphaAcid: 10, ...o });
const whirlpool = (o: Partial<IbuLine> = {}) => boil({ stage: "whirlpool", timingMinutes: null, ...o });
const text = (lines: IbuLine[], saved = false) => ibuText(recipeIbu({ ogPlato: OG, lines }), { saved });

describe("recipeIbu", () => {
  it("gives the goldens for 1 lb/bbl of a 10% hop: 89 at 60 minutes and OG 1.050, 19 in the whirlpool", () => {
    expect(recipeIbu({ ogPlato: OG, lines: [boil()] })).toEqual({ kind: "estimate", ibu: 89, whirlpool: false });
    expect(recipeIbu({ ogPlato: OG, lines: [whirlpool()] })).toEqual({ kind: "estimate", ibu: 19, whirlpool: true });
  });

  it("rounds the sum, not each line", () => {
    expect(recipeIbu({ ogPlato: OG, lines: [whirlpool(), whirlpool()] })).toMatchObject({ ibu: 39 });
  });

  it("a stronger wort takes up less of a boil hop, and a whirlpool hop does not care", () => {
    const heavier = sgToPlato(1.08);
    expect(recipeIbu({ ogPlato: heavier, lines: [boil()] })).toMatchObject({ ibu: 68 });
    expect(recipeIbu({ ogPlato: heavier, lines: [whirlpool()] })).toMatchObject({ ibu: 19 });
  });

  it.each([["oz", 16], ["g", 453.59237], ["kg", 0.45359237]])("reads %s as the same weight as lb", (unit, perBblQty) => {
    expect(recipeIbu({ ogPlato: OG, lines: [boil({ unit, perBblQty })] })).toMatchObject({ ibu: 89 });
  });

  it("adds nothing for a dry hop or for a boil addition that is not a hop", () => {
    const dryHop = boil({ stage: "dry_hop", timingMinutes: 5760 });
    const adjunct = boil({ category: "adjunct" });
    expect(recipeIbu({ ogPlato: OG, lines: [boil(), dryHop, adjunct] })).toMatchObject({ ibu: 89 });
  });

  it("counts a boil line timed at zero as no bitterness, not as a missing time", () => {
    expect(recipeIbu({ ogPlato: OG, lines: [boil(), boil({ timingMinutes: 0 })] })).toEqual({ kind: "estimate", ibu: 89, whirlpool: false });
  });
});

describe("ibuText, the first matching row wins", () => {
  it("no predicted OG", () => {
    expect(ibuText(recipeIbu({ ogPlato: null, lines: [] }), { saved: false })).toBe("IBU not estimated: no predicted OG");
    expect(ibuText(recipeIbu({ ogPlato: null, lines: [boil()] }), { saved: false })).toBe("IBU not estimated: no predicted OG");
  });

  it("no boil or whirlpool hops", () => {
    expect(text([boil({ stage: "dry_hop", timingMinutes: null })])).toBe("IBU not estimated: no boil or whirlpool hops");
    expect(text([boil({ stage: "mash", category: "malt" })])).toBe("IBU not estimated: no boil or whirlpool hops");
  });

  it("every counted hop has a gap", () => {
    expect(text([boil({ alphaAcid: null }), whirlpool({ name: "Mosaic", alphaAcid: null })])).toBe("IBU not estimated: no alpha acid: Citra, Mosaic");
  });

  it("some counted hops have a gap: a lower bound, never a guess", () => {
    expect(text([boil(), whirlpool({ name: "Mosaic", alphaAcid: null })])).toBe("IBU ≥ 89 · no alpha acid: Mosaic");
  });

  it("no gaps", () => {
    expect(text([boil()])).toBe("IBU 89");
    expect(text([boil(), whirlpool({ name: "Mosaic" })])).toBe("IBU 108 · whirlpool hops at 5%");
  });

  it("groups gaps by reason, names a hop on two lines once, and lists a line with two gaps under both", () => {
    const lines = [
      boil({ name: "Galaxy" }),
      boil({ name: "Citra", alphaAcid: null }), whirlpool({ name: "Citra", alphaAcid: null }),
      boil({ name: "Mosaic", timingMinutes: null }),
      boil({ name: "Nelson", unit: "each" }),
      boil({ name: "Simcoe", unit: "gal", alphaAcid: null }),
    ];
    expect(text(lines)).toBe("IBU ≥ 89 · no alpha acid: Citra, Simcoe · no boil time: Mosaic · not by weight: Nelson, Simcoe");
  });

  it("does not ask a whirlpool hop for a time", () => {
    expect(text([whirlpool({ timingMinutes: null })])).toBe("IBU 19 · whirlpool hops at 5%");
  });

  it("says how to fix missing alpha acid on a saved version, which a draft does not need", () => {
    const lines = [boil(), boil({ name: "Mosaic", alphaAcid: null })];
    expect(text(lines, true)).toBe("IBU ≥ 89 · no alpha acid: Mosaic; set alpha acid under Materials, then save a change to this recipe");
    expect(text(lines, false)).toBe("IBU ≥ 89 · no alpha acid: Mosaic");
    expect(text([boil({ timingMinutes: null })], true)).toBe("IBU not estimated: no boil time: Citra");
  });
});
