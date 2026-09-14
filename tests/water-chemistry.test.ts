// tests/water-chemistry.test.ts — the one water formula (spec 2026-09-14): salt ppm, read-out and the solver.
import { describe, expect, it } from "vitest";
import { gramsOf, suggestSalts, waterChemistry, type Ions } from "@/lib/water-chemistry";

const denver: Ions = { calcium: 42, magnesium: 8, sodium: 22, sulfate: 65, chloride: 30, bicarbonate: 110 };
const hazy: Ions = { calcium: 110, magnesium: 10, sodium: 15, sulfate: 90, chloride: 180, bicarbonate: 40 };
const tenLiters = { mashGal: 10 / 3.78541, spargeGal: 0 };

describe("waterChemistry", () => {
  it("adds textbook ppm for 1 g gypsum in 10 L", () => {
    const rows = waterChemistry({ source: denver, ...tenLiters, additions: [{ salt: "gypsum", grams: 1 }] });
    const ca = rows.find((r) => r.ion === "calcium")!, so4 = rows.find((r) => r.ion === "sulfate")!;
    expect(ca.added).toBeCloseTo(23.28, 1);
    expect(ca.result).toBeCloseTo(65.28, 1);
    expect(so4.added).toBeCloseTo(55.77, 1);
    expect(rows.find((r) => r.ion === "sodium")!.added).toBe(0);
  });
  it("sums every stage into total water and reports delta against target", () => {
    const rows = waterChemistry({ source: denver, target: hazy, mashGal: 9.5, spargeGal: 12, additions: [{ salt: "calcium_chloride", grams: 6 }, { salt: "gypsum", grams: 4 }] });
    const liters = 21.5 * 3.78541;
    const cl = rows.find((r) => r.ion === "chloride")!;
    expect(cl.added).toBeCloseTo((6 * 482.3) / liters, 2);
    expect(cl.target).toBe(180);
    expect(cl.delta).toBeCloseTo(cl.result - 180, 6);
  });
  it("ignores additions without a salt and returns nothing for zero water", () => {
    expect(waterChemistry({ source: denver, mashGal: 0, spargeGal: 0, additions: [] })).toEqual([]);
    const rows = waterChemistry({ source: denver, ...tenLiters, additions: [{ salt: null, grams: 5 }, { salt: undefined, grams: 5 }] });
    expect(rows.every((r) => r.added === 0)).toBe(true);
  });
  it("converts ounces to grams and leaves grams alone", () => {
    expect(gramsOf(1, "oz")).toBeCloseTo(28.3495, 4);
    expect(gramsOf(3, "g")).toBe(3);
    expect(gramsOf(3, "mL")).toBe(3);
  });
  it("rejects negative water", () => {
    expect(() => waterChemistry({ source: denver, mashGal: -1, spargeGal: 0, additions: [] })).toThrow();
  });
});

describe("suggestSalts", () => {
  it("recovers the grams that produced an achievable target within 0.1 g and never goes negative", () => {
    // 10 L; a target built from 2 g calcium chloride and 0.5 g gypsum on top of source is reachable exactly.
    const L = 10;
    const target: Ions = {
      ...denver,
      calcium: denver.calcium + (2 * 272.6 + 0.5 * 232.8) / L,
      chloride: denver.chloride + (2 * 482.3) / L,
      sulfate: denver.sulfate + (0.5 * 557.7) / L,
    };
    const out = suggestSalts({ source: denver, target, totalGal: L / 3.78541, salts: ["gypsum", "calcium_chloride"] });
    const grams = Object.fromEntries(out.map((s) => [s.salt, s.grams]));
    expect(grams.calcium_chloride).toBeCloseTo(2.0, 1);
    expect(grams.gypsum).toBeCloseTo(0.5, 1);
    expect(out.every((s) => s.grams >= 0)).toBe(true);
  });
  it("returns nothing when the target is already met or no salts are stocked", () => {
    expect(suggestSalts({ source: denver, target: denver, totalGal: 5, salts: ["gypsum"] })).toEqual([]);
    expect(suggestSalts({ source: denver, target: hazy, totalGal: 5, salts: [] })).toEqual([]);
  });
  it("only uses the salts it is given and drops zeros", () => {
    const out = suggestSalts({ source: denver, target: hazy, totalGal: 21.5, salts: ["gypsum", "calcium_chloride", "epsom_salt"] });
    expect(out.every((s) => ["gypsum", "calcium_chloride", "epsom_salt"].includes(s.salt))).toBe(true);
    expect(out.every((s) => s.grams > 0)).toBe(true);
  });
});
