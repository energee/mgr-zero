import { describe, expect, it } from "vitest";
import { formatVolume } from "@/lib/volume";

describe("formatVolume", () => {
  it.each([
    ["0.50000000", "½ bbl"],
    ["0.16666667", "⅙ bbl"],
    ["0.09677419", "3 gal"],
    ["0.01612903", "64 oz"],
    ["0.00403226", "16 oz"],
    ["15", "15 bbl"],
    ["0.3", "0.3 bbl"],
    ["-0.00403226", "−16 oz"],
    ["-15", "−15 bbl"],
    ["0.125", "⅛ bbl"],
    // Below the rounding tolerance: a real figure, never "0 gal".
    ["0.000001", "0.000001 bbl"],
    // Ounces are for containers, so they stop at a gallon: 0.75 bbl is 23.25
    // gallons, which is a whole number of ounces but not a figure anyone reads.
    ["0.75", "0.75 bbl"],
    ["0.07258065", "0.07258065 bbl"],
    // A whole gallon still wins as the larger unit; 120 oz has no whole gallon
    // and sits under the ceiling, so it stays in ounces.
    ["0.03225806", "1 gal"],
    ["0.03024194", "120 oz"],
    // Nothing usable in, a dash out: never a real-looking "0 bbl" or "NaN bbl".
    ["", "—"],
    ["abc", "—"],
    ["   ", "—"],
  ])("formats %s bbl as %s", (bbl, expected) => {
    expect(formatVolume(bbl)).toBe(expected);
  });
});
