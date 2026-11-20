// tests/material-category-keywords.test.ts — the keyword baseline the material kind experiment compares Jev against.
import { describe, expect, it } from "vitest";
import { keywordMaterialCategory } from "@/scripts/material-category-keywords";

describe("keywordMaterialCategory", () => {
  it.each([
    ["Pale malt 2-row", "malt"],
    ["Caramel 40", "malt"],
    ["Amarillo pellets", "hop"],
    ["Safale S-04", "yeast"],
    ["Flaked barley", "adjunct"],
    ["Calcium sulfate", "chemical"],
    ["12oz crowler can", "packaging"],
    ["Nitrile glove box", "other"],
  ])("reads %s as %s", (name, kind) => {
    expect(keywordMaterialCategory(name)).toBe(kind);
  });

  it.each([
    ["IPA can label", "packaging"],
    ["Acidulated malt", "malt"],
    ["Yeast nutrient", "chemical"],
    ["Hop CO2 extract", "hop"],
    ["Lactose", "adjunct"],
  ])("lets the earlier list win a mixed name: %s is %s", (name, kind) => {
    expect(keywordMaterialCategory(name)).toBe(kind);
  });

  it("returns null when no list matches", () => {
    expect(keywordMaterialCategory("Widget 42")).toBeNull();
  });
});
