// tests/settings-view.test.ts — the Settings brewery form's books-opened field
// (docs/plans/lolev-history.md task 4): the form saves it through its own
// command, and only when it changed, so a refused date never blocks the rest.
// The one-way keg fee field saves the same way (docs/plans/lolev-orders.md task 6).
import { describe, expect, it } from "vitest";
import { booksOpenedChange, oneWayKegFeeChange } from "@/lib/mgr/settings-view";

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

describe("oneWayKegFeeChange", () => {
  it("is nothing when the fee did not change", () => {
    expect(oneWayKegFeeChange(1000, "10.00")).toBeUndefined();
    expect(oneWayKegFeeChange(0, "")).toBeUndefined();
  });

  it("sends the new fee in cents, and a cleared field as no fee", () => {
    expect(oneWayKegFeeChange(1000, "12.50")).toEqual({ feeCents: 1250 });
    expect(oneWayKegFeeChange(1000, "")).toEqual({ feeCents: 0 });
  });
});
