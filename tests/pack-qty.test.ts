// tests/pack-qty.test.ts — a base-unit amount read and entered as whole packs
// plus loose base units, and a recipe's batch amount read as a count of packs
// (lib/mgr/pack-qty.ts).
import { describe, expect, it } from "vitest";
import { fromPacks, packs, packText, perBblForPacks, splitPacks } from "@/lib/mgr/pack-qty";

describe("packs", () => {
  it("names whole packs when the amount divides evenly", () => {
    expect(packs(110, 55, "lb")).toBe("2 × 55 lb");
    expect(packs(44, 44, "lb")).toBe("1 × 44 lb");
  });
  it("adds the loose remainder after the packs", () => {
    expect(packs(220, 50, "lb")).toBe("4 × 50 lb + 20 lb");
  });
  it("leaves an amount under one pack, or a material bought by the base unit, as base units", () => {
    expect(packs(20, 50, "lb")).toBe("20 lb");
    expect(packs(1650, 1, "lb")).toBe("1650 lb");
  });
  it("keeps decimal remainders exact", () => {
    expect(packs(100.3, 50, "lb")).toBe("2 × 50 lb + 0.3 lb");
  });
});

describe("splitPacks", () => {
  it("splits an amount into whole packs and the loose rest", () => {
    expect(splitPacks(220, 50)).toEqual({ packs: 4, loose: 20 });
    expect(splitPacks(110, 55)).toEqual({ packs: 2, loose: 0 });
    expect(splitPacks(100.3, 50)).toEqual({ packs: 2, loose: 0.3 });
  });
});

describe("fromPacks", () => {
  it("converts packs plus loose back to base units", () => {
    expect(fromPacks(4, 20, 50)).toBe(220);
    expect(fromPacks(4.4, 0, 50)).toBe(220);
    expect(fromPacks(0.1, 0.2, 1)).toBe(0.3);
  });
  it("multiplies by a six-decimal pack size before rounding, as the receipt ledger does", () => {
    expect(fromPacks(100, 0, 2.204623)).toBe(220.4623);
    expect(fromPacks(25, 0, 2.204623)).toBe(55.1156);
  });
  it("round-trips splitPacks for a six-decimal pack size", () => {
    expect(splitPacks(220.4623, 2.204623)).toEqual({ packs: 100, loose: 0 });
    for (const qty of [55.1156, 220.4623, 1000, 0.5]) {
      const split = splitPacks(qty, 2.204623);
      expect(fromPacks(split.packs, split.loose, 2.204623)).toBe(qty);
      expect(split.loose).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("packText", () => {
  const bag = { factor: 55, unit: "lb", packName: "bag" as const };
  it("reads whole packs as a count with the material's pack word", () => {
    expect(packText(1265, bag)).toBe("23 bags");
    expect(packText(55, bag)).toBe("1 bag");
    expect(packText(0.25, { factor: 0.25, unit: "lb", packName: "bottle" })).toBe("1 bottle");
    expect(packText(10, { factor: 10, unit: "l", packName: "pitch" })).toBe("1 pitch");
    // Sold by the piece: a material counted in "each" is its own pack once it has a word, so one yeast is "1 pitch".
    const pitch = { factor: 1, unit: "each", packName: "pitch" } as const;
    expect(packText(1, pitch)).toBe("1 pitch");
    expect(packText(2, pitch)).toBe("2 pitches");
    expect(packText(1.5, pitch)).toBe("1.5 each");
    expect(packText(3, { factor: 1, unit: "each", packName: null })).toBe("3 each");
  });
  it("adds -es to the words that take it", () => {
    expect(packText(20, { factor: 10, unit: "l", packName: "pitch" })).toBe("2 pitches");
    expect(packText(88, { factor: 44, unit: "lb", packName: "box" })).toBe("2 boxes");
  });
  it("reads whole packs as a count of the pack size when the material has no pack word", () => {
    expect(packText(950, { factor: 50, unit: "lb", packName: null })).toBe("19 × 50 lb");
  });
  it("stays in the amount's unit when it is not whole packs", () => {
    expect(packText(968, { factor: 50, unit: "lb", packName: "sack" })).toBe("968 lb");
    expect(packText(0.253, { factor: 0.25, unit: "lb", packName: "bottle" })).toBe("0.253 lb");
    // Under one pack.
    expect(packText(8.8, { factor: 44, unit: "lb", packName: "box" })).toBe("8.8 lb");
  });
  it("stays in the amount's unit when the material has neither a pack size nor a pack word", () => {
    expect(packText(8.8, { factor: 1, unit: "lb", packName: null })).toBe("8.8 lb");
    expect(packText(3, { factor: 1, unit: "each", packName: null })).toBe("3 each");
  });
});

describe("perBblForPacks", () => {
  it("gives the per-bbl amount that makes a count of packs at a batch size, to 6 decimals", () => {
    expect(perBblForPacks(23, 55, 22)).toBe(57.5);
    expect(perBblForPacks(1, 50, 22)).toBe(2.272727);
  });
});
