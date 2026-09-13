// Issue #333: enum values must reach operators as human labels, never as the
// raw lowercase/snake_case database value.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sentenceCase, IMPORT_KIND_LABELS, importKindLabel } from "@/lib/mgr/labels";
import { MOVEMENT_KIND_OPTIONS } from "@/lib/mgr/record-movement-view";
import { toLocationsViewProps } from "@/lib/mgr/locations-view";
import { channelTreatmentLabel } from "@/lib/mgr/sale-channels-view";
import { treatmentLabel, TAX_TREATMENTS } from "@/app/(app)/settings/channels/tax-treatments";
import { IMPORT_KINDS } from "@/lib/import-csv";
import { movementTypeLabel } from "@/lib/movement-form";

describe("sentenceCase", () => {
  it("humanizes snake_case and already-spaced values alike", () => {
    expect(sentenceCase("opening_balance")).toBe("Opening balance");
    expect(sentenceCase("opening balance")).toBe("Opening balance");
    expect(sentenceCase("")).toBe("");
  });

  it("still backs the movement type label from #255/#269", () => {
    expect(movementTypeLabel("festival_removal")).toBe("Festival removal");
  });
});

describe("import kinds", () => {
  it("names every kind the way the staff guide does", () => {
    expect(IMPORT_KINDS.map(importKindLabel)).toEqual([
      "Customers", "Ship-tos", "Products / SKUs", "Channel prices", "Opening balances",
    ]);
  });

  it("covers every kind, so no raw value can leak", () => {
    expect(Object.keys(IMPORT_KIND_LABELS).sort()).toEqual([...IMPORT_KINDS].sort());
  });
});

describe("movement reasons", () => {
  it("offers Title-cased reasons", () => {
    expect([...MOVEMENT_KIND_OPTIONS]).toEqual([
      "Opening balance", "Depletion", "Loss", "Sample", "Festival removal",
      "Destruction", "Adjustment", "Production in", "Return in",
    ]);
  });
});

describe("tax treatments", () => {
  it("labels every treatment in sentence case", () => {
    expect(TAX_TREATMENTS.map(treatmentLabel)).toEqual([
      "Taxable", "Export", "Vessel supplies", "Research", "Transfer in bond",
    ]);
    expect(channelTreatmentLabel("vessel_supplies")).toBe("Vessel supplies");
  });
});

describe("location kinds", () => {
  it("capitalizes the kind in the row detail", () => {
    const model = toLocationsViewProps({
      locations: [{ id: "loc-1", name: "Taproom", kind: "taproom", taps: 11, bins: 3 }],
    });
    expect(model.rows[0].detail).toBe("Taproom · 11 taps · 3 bins");
  });
});

describe("no raw enum leaks", () => {
  it("keeps the import kind select off raw underscore replacement", () => {
    const src = readFileSync("app/(app)/settings/import/import-wizard.tsx", "utf8");
    expect(src).not.toMatch(/replaceAll\("_", " "\)/);
  });
});
