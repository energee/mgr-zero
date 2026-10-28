// tests/uom.test.ts — converting an amount between units of one kind (lib/uom.ts).
import { describe, expect, it } from "vitest";
import { convertUom } from "@/lib/uom";

describe("convertUom", () => {
  it("converts within mass and within volume", () => {
    expect(convertUom(1, "lb", "g")).toBeCloseTo(453.59237, 8);
    expect(convertUom(2, "oz", "g")).toBeCloseTo(56.69904625, 8);
    expect(convertUom(1000, "g", "kg")).toBe(1);
    expect(convertUom(5, "mL", "l")).toBeCloseTo(0.005, 10);
    expect(convertUom(1, "gal", "ml")).toBeCloseTo(3785.411784, 8);
    expect(convertUom(40, "g", "g")).toBe(40);
  });
  it("refuses across kinds, for each, and for an unknown unit", () => {
    expect(convertUom(5, "mL", "lb")).toBeNull();
    expect(convertUom(5, "g", "each")).toBeNull();
    expect(convertUom(5, "cup", "ml")).toBeNull();
  });
});
