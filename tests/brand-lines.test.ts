// tests/brand-lines.test.ts — how an order line or orderable SKU is named: from
// its brand and format, never the SKU name (which may carry the alias in place
// of the brand), with the brand's alias kept apart for a muted second line.
import { describe, expect, it } from "vitest";
import { brandLabel, formatLabel, lineLabel } from "../lib/mgr/brand-lines";

const giraffe = { name: "Animal #31 · Sixtel", brands: { name: "Masai Giraffe", alias: "Animal #31" }, formats: { name: "Sixtel" } };
const pils = { name: "Pils · Case", brands: { name: "Pils", alias: null }, formats: { name: "Case" } };

describe("lineLabel", () => {
  it("names the brand then the format, with the alias apart", () => {
    expect(lineLabel(giraffe)).toEqual({ name: "Masai Giraffe · Sixtel", alias: "Animal #31" });
    expect(lineLabel(pils)).toEqual({ name: "Pils · Case" });
  });
  it("keeps the SKU name when the read has no brand and format", () => {
    expect(lineLabel({ name: "Legacy keg" })).toEqual({ name: "Legacy keg" });
    expect(lineLabel(null)).toEqual({ name: "Line" });
  });
});

describe("grouped labels", () => {
  it("Confirm order groups by brand: the heading is the brand, its alias apart, the line the format", () => {
    expect(brandLabel(giraffe)).toEqual({ group: "Masai Giraffe", alias: "Animal #31", name: "Sixtel" });
    expect(brandLabel(pils)).toEqual({ group: "Pils", name: "Case" });
  });
  it("Pick groups by format: the line is the brand, its alias apart", () => {
    expect(formatLabel(giraffe)).toEqual({ group: "Sixtel", name: "Masai Giraffe", alias: "Animal #31" });
    expect(formatLabel({ name: "Legacy keg" })).toEqual({ name: "Legacy keg" });
  });
});
