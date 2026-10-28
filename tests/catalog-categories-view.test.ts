// tests/catalog-categories-view.test.ts — the inventory Manage categories
// adapter's pure list edits (add, rename, case-insensitive duplicate refusal, delete).
import { describe, expect, it } from "vitest";
import { categoryNameError, deleteCategory, saveCategory } from "../lib/mgr/catalog-categories-view";

describe("catalog categories fixture edits", () => {
  it("adds a new name at the end", () => {
    expect(saveCategory(["IPA"], "Lager")).toEqual({ names: ["IPA", "Lager"] });
  });
  it("renames in place", () => {
    expect(saveCategory(["IPA", "Stout"], "Porter", "Stout")).toEqual({ names: ["IPA", "Porter"] });
  });
  it("refuses a duplicate name", () => {
    expect(saveCategory(["IPA", "Stout"], "IPA", "Stout")).toEqual({ error: "A category named IPA already exists" });
  });
  it("refuses a case variant of another category, naming its spelling", () => {
    expect(categoryNameError(["Core", "Seasonal"], " core ")).toBe("A category named Core already exists");
    expect(categoryNameError(["Core", "Seasonal"], "CORE", "Seasonal")).toBe("A category named Core already exists");
    expect(saveCategory(["Core"], "core")).toEqual({ error: "A category named Core already exists" });
  });
  it("allows a case-only rename of the same category", () => {
    expect(categoryNameError(["Core"], "CORE", "Core")).toBeUndefined();
    expect(saveCategory(["Core", "IPA"], "CORE", "Core")).toEqual({ names: ["CORE", "IPA"] });
  });
  it("deletes by name", () => {
    expect(deleteCategory(["IPA", "Stout"], "IPA")).toEqual(["Stout"]);
  });
});
