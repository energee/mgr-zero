// tests/pack-qty.test.ts — a base-unit amount read and entered as whole packs
// plus loose base units (lib/mgr/pack-qty.ts).
import { describe, expect, it } from "vitest";
import { fromPacks, packs, splitPacks } from "@/lib/mgr/pack-qty";

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
});
