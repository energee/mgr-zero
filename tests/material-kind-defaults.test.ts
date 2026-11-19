// tests/material-kind-defaults.test.ts — Add material: a set kind fills Base unit, Purchase unit and Lot-tracked,
// but never a field the user changed.
import { describe, expect, it } from "vitest";
import { fieldsForKind } from "@/lib/mgr/material-view";

const initial = { unit: "lb", purchaseUnit: "lb", lotTracked: false };

describe("fieldsForKind", () => {
  it("fills every untouched field from the kind", () => {
    expect(fieldsForKind(initial, "", "hop", initial)).toEqual({ unit: "lb", purchaseUnit: "lb", lotTracked: true });
    expect(fieldsForKind(initial, "", "malt", initial)).toEqual({ unit: "lb", purchaseUnit: "lb", lotTracked: true });
    expect(fieldsForKind(initial, "", "yeast", initial)).toEqual({ unit: "each", purchaseUnit: "each", lotTracked: true });
    expect(fieldsForKind(initial, "", "packaging", initial)).toEqual({ unit: "each", purchaseUnit: "each", lotTracked: false });
  });

  it("leaves everything unchanged for a kind without defaults", () => {
    for (const kind of ["adjunct", "chemical", "other"]) expect(fieldsForKind(initial, "", kind, initial)).toEqual(initial);
  });

  it("keeps a field the user changed", () => {
    const changed = { unit: "kg", purchaseUnit: "lb", lotTracked: false };
    expect(fieldsForKind(changed, "", "yeast", initial)).toEqual({ unit: "kg", purchaseUnit: "each", lotTracked: true });
  });

  it("refills fields the previous kind filled when the kind is corrected", () => {
    const fromYeast = { unit: "each", purchaseUnit: "each", lotTracked: true };
    expect(fieldsForKind(fromYeast, "yeast", "packaging", initial)).toEqual({ unit: "each", purchaseUnit: "each", lotTracked: false });
    expect(fieldsForKind(fromYeast, "yeast", "malt", initial)).toEqual({ unit: "lb", purchaseUnit: "lb", lotTracked: true });
  });

  it("keeps a field the user changed after the previous kind filled it", () => {
    const edited = { unit: "each", purchaseUnit: "kg", lotTracked: true };
    expect(fieldsForKind(edited, "yeast", "malt", initial)).toEqual({ unit: "lb", purchaseUnit: "kg", lotTracked: true });
  });
});
