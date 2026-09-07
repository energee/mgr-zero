// tests/gravity-unit.test.ts — the display/entry half of the gravity unit
// preference. Storage is always °Plato (Ted's ruling); these two pure
// functions are the only place a brewer's chosen unit turns a stored Plato
// number into text and typed text back into Plato. Pure: no database.
import { describe, expect, it } from "vitest";
import { formatGravity, parseGravity } from "@/lib/mgr/gravity-unit";
import { platoToSg, sgToPlato } from "@/lib/recipe-gravity";

describe("formatGravity", () => {
  it("prints Plato to one decimal with the degree symbol", () => {
    expect(formatGravity(12.5, "plato")).toBe("12.5 °P");
    expect(formatGravity(0, "plato")).toBe("0.0 °P");
  });

  it("prints SG to three decimals, converted from the stored Plato", () => {
    expect(formatGravity(12.5, "sg")).toBe("1.050");
    expect(formatGravity(0, "sg")).toBe("1.000");
  });
});

describe("parseGravity", () => {
  it("reads Plato input as itself", () => {
    expect(parseGravity("12.5", "plato")).toBe(12.5);
    expect(parseGravity(" 12.5 ", "plato")).toBe(12.5);
  });

  it("accepts both SG spellings — 1.050 and 1050 — as the same gravity", () => {
    const dotted = parseGravity("1.050", "sg");
    const points = parseGravity("1050", "sg");
    expect(dotted).not.toBeNull();
    expect(points).toBe(dotted);
    // SG 1.050 is ~12.4 °P by the ASBC cubic; the two approximations differ
    // by about 0.1 °P (well under the documented 0.001 SG).
    expect(dotted!).toBeCloseTo(12.4, 1);
  });

  it("returns null for anything that is not a number", () => {
    for (const bad of ["", "  ", "abc", "1.0.5"]) {
      expect(parseGravity(bad, "plato"), bad).toBeNull();
      expect(parseGravity(bad, "sg"), bad).toBeNull();
    }
  });
});

describe("round trips", () => {
  it("survives Plato → text → Plato in both units", () => {
    for (const plato of [0, 2.4, 5.2, 12.5, 15.2, 22]) {
      expect(parseGravity(formatGravity(plato, "plato"), "plato")).toBeCloseTo(plato, 1);
      // SG carries three decimals, so the trip is lossy by design; 0.1 °P is
      // finer than any hydrometer a brewer reads.
      expect(parseGravity(formatGravity(plato, "sg"), "sg"), `${plato} °P`).toBeCloseTo(plato, 0);
    }
  });

  it("platoToSg and sgToPlato agree to within 0.001 SG — different approximations, documented", () => {
    for (const plato of [1, 5, 10, 15, 20, 25]) {
      const sg = platoToSg(plato);
      expect(Math.abs(platoToSg(sgToPlato(sg)) - sg), `${plato} °P`).toBeLessThanOrEqual(0.001);
    }
  });
});
