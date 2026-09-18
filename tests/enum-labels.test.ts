// Issue #333: enum values must reach operators as human labels, never as the
// raw lowercase/snake_case database value.
import { describe, expect, it } from "vitest";
import { sentenceCase, importKindLabel } from "@/lib/mgr/labels";
import { MOVEMENT_KIND_OPTIONS } from "@/lib/mgr/record-movement-view";
import { toLocationsViewProps } from "@/lib/mgr/locations-view";
import { TAX_TREATMENTS } from "@/lib/mgr/tax-treatments";
import { IMPORT_KINDS } from "@/lib/import-csv";

describe("sentenceCase", () => {
  it("humanizes snake_case and already-spaced values alike", () => {
    expect(sentenceCase("opening_balance")).toBe("Opening balance");
    expect(sentenceCase("opening balance")).toBe("Opening balance");
    expect(sentenceCase("")).toBe("");
  });

  it("still produces the movement type labels from #255/#269", () => {
    expect(sentenceCase("festival_removal")).toBe("Festival removal");
  });
});

describe("import kinds", () => {
  it("names every kind the way the staff guide does", () => {
    expect(IMPORT_KINDS.map(importKindLabel)).toEqual([
      "Customers", "Ship-tos", "Products / SKUs", "Channel prices", "Opening balances",
    ]);
  });
});

describe("movement reasons", () => {
  it("offers reasons an operator can read — capitalized, never snake_case", () => {
    for (const option of MOVEMENT_KIND_OPTIONS) {
      expect(option).not.toMatch(/_/);
      expect(option[0]).toBe(option[0]!.toUpperCase());
    }
    expect(MOVEMENT_KIND_OPTIONS).toContain("Festival removal");
  });
});

describe("tax treatments", () => {
  it("labels every treatment in sentence case", () => {
    expect(TAX_TREATMENTS.map(sentenceCase)).toEqual([
      "Taxable", "Export", "Vessel supplies", "Research", "Transfer in bond",
    ]);
  });
});

describe("location uses", () => {
  it("capitalizes every use in the row detail", () => {
    const model = toLocationsViewProps({
      locations: [{ id: "loc-1", name: "Taproom", uses: ["taproom", "storage"], taps: 11, bins: 3 }],
    });
    expect(model.rows[0].detail).toBe("Taproom · Storage · 11 taps · 3 bins");
  });
});
