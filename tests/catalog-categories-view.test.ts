// tests/catalog-categories-view.test.ts — the inventory Manage categories
// adapter's pure list edits (add, rename, duplicate refusal, delete).
import { describe, expect, it } from "vitest";
import { deleteCategory, saveCategory } from "../lib/mgr/catalog-categories-view";

describe("catalog categories fixture edits", () => {
  it("adds a new name at the end", () => {
    expect(saveCategory(["IPA"], "Lager")).toEqual({ names: ["IPA", "Lager"] });
  });
  it("renames in place", () => {
    expect(saveCategory(["IPA", "Stout"], "Porter", "Stout")).toEqual({ names: ["IPA", "Porter"] });
  });
  it("refuses a duplicate name", () => {
    expect(saveCategory(["IPA", "Stout"], "IPA", "Stout")).toEqual({ error: "A category with this name already exists" });
  });
  it("deletes by name", () => {
    expect(deleteCategory(["IPA", "Stout"], "IPA")).toEqual(["Stout"]);
  });
});
