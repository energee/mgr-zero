// tests/settings-view.test.ts — the Settings brewery form's books-opened field
// (docs/plans/lolev-history.md task 4): the form saves it through its own
// command, and only when it changed, so a refused date never blocks the rest.
import { describe, expect, it } from "vitest";
import { booksOpenedChange } from "@/lib/mgr/settings-view";

describe("booksOpenedChange", () => {
  it("is nothing when the date did not change", () => {
    expect(booksOpenedChange("2026-10-01", "2026-10-01")).toBeUndefined();
    expect(booksOpenedChange("", "")).toBeUndefined();
  });

  it("sends the new date", () => {
    expect(booksOpenedChange("", "2026-10-01")).toEqual({ booksOpenedOn: "2026-10-01" });
    expect(booksOpenedChange("2026-09-01", "2026-10-01")).toEqual({ booksOpenedOn: "2026-10-01" });
  });

  it("sends null when the field is cleared", () => {
    expect(booksOpenedChange("2026-10-01", "")).toEqual({ booksOpenedOn: null });
  });
});
