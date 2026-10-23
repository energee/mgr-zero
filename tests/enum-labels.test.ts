// Issue #333: enum values must reach operators as human labels, never as the
// raw lowercase/snake_case database value.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { connectionStateLabel, sentenceCase, importKindLabel } from "@/lib/mgr/labels";
import { MOVEMENT_TYPES } from "@/lib/movement-form";
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
    const options = MOVEMENT_TYPES.map(sentenceCase);
    for (const option of options) {
      expect(option).not.toMatch(/_/);
      expect(option[0]).toBe(option[0]!.toUpperCase());
    }
    expect(options).toContain("Festival removal");
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

describe("connection states (#1151)", () => {
  it("names each QuickBooks and Square connection state as a status", () => {
    expect(["connected", "disconnected", "recovery_required"].map(connectionStateLabel)).toEqual([
      "Connected", "Not connected", "Reconnect required",
    ]);
  });

  it("is the label every page that prints a connection state uses", () => {
    // Point of sale and Invoices build their status in the page, not in a tested adapter.
    for (const file of ["lib/mgr/accounting-view.ts", "app/(app)/settings/pos/page.tsx", "app/(app)/invoices/page.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("connectionStateLabel(health.state)");
      expect(source, file).not.toMatch(/state\.replace(All)?\(/);
    }
  });
});
