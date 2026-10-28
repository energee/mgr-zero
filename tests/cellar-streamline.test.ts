// tests/cellar-streamline.test.ts — #1508: cellar and production verbs start
// from what the page already knows. A tile carries its own Reading, the sheet
// returns to where it opened, cellar forms open on the tank they were opened
// for (or the only one), Complete batch leads with one loss line, and the
// packaging and batch sheets start from derivable defaults.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/commands/use-command-form", () => ({ useCommandForm: () => ({ open: true, setOpen() {}, submitting: false, error: null, submit() {} }) }));
vi.mock("@/components/mgr/command-form", async (original) => {
  const real = await original<typeof import("@/components/mgr/command-form")>();
  return { ...real, CommandForm: (props: { trigger: unknown; children: unknown; footer?: unknown }) => createElement("div", null, props.trigger as never, props.children as never, props.footer as never) };
});
import { toCellarMapViewProps } from "@/lib/mgr/cellar-map-view";
import { CellarMapView } from "@/components/mgr/views/cellar-map";
import { readingReturnHref } from "@/lib/mgr/fermentation-reading-view";
import { onlyOccupancy } from "@/lib/mgr/cellar-transfer-view";
import { completionLoss } from "@/lib/mgr/batch-completion-state";
import { plannedDrawBbl } from "@/lib/mgr/schedule-packaging-run-view";
import { brandAfterRecipePick } from "@/lib/mgr/schedule-batch-view";
import { FermentationReadingView } from "@/components/mgr/views/fermentation-reading";
import { CellarTransferForm } from "@/app/(app)/cellar/cellar-transfer-form";
import { CellarAdditionForm } from "@/app/(app)/cellar/cellar-addition-form";
import { NewBatchForm } from "@/app/(app)/batches/new-batch-form";
import { cellarAdditionCitra, cellarTransferPils } from "@/lib/mgr/fixtures/production";

const vessels = [{ id: "v1", name: "FV1", capacity_bbl: 10 }, { id: "v2", name: "FV2", capacity_bbl: 10 }, { id: "v3", name: "FV3", capacity_bbl: 10 }];
const two = [{ vessel_id: "v1", occupancy_id: "o1", brand_name: null, bbl: 2 }, { vessel_id: "v2", occupancy_id: "o2", brand_name: null, bbl: 3 }];
const reading = (occupancyId: string) => `/cellar/${occupancyId}/reading?from=/cellar`;

describe("item 1: Reading from each tile, back to where it opened", () => {
  it("gives every occupied tile its own Reading and an empty tile none", () => {
    const model = toCellarMapViewProps(vessels, two, {}, {}, reading);
    expect(model.tiles.map(tile => tile.readingHref)).toEqual(["/cellar/o1/reading?from=/cellar", "/cellar/o2/reading?from=/cellar", undefined]);
    expect(model.actionHint).toBe("Several tanks hold beer. Use Reading on a tank.");
    const html = renderToStaticMarkup(createElement(CellarMapView, { model }));
    expect(html).toContain('href="/cellar/o2/reading?from=/cellar"');
  });

  it("returns to Cellar, Batches or the batch the sheet opened from, else the vessel", () => {
    const batch = "/batches/0f8fad5b-d9cb-469f-a165-70867728950e";
    expect(readingReturnHref("/cellar", "v1")).toBe("/cellar");
    expect(readingReturnHref("/batches", "v1")).toBe("/batches");
    expect(readingReturnHref(batch, "v1")).toBe(batch);
    for (const from of [undefined, "", "https://evil.example", "//evil.example", "/settings", "/batches/x/../../settings", ["/cellar"]]) {
      expect(readingReturnHref(from, "v1")).toBe("/cellar/vessels/v1");
    }
  });
});

describe("item 2: cellar forms open on their tank", () => {
  it("names the only open tank, or none when there is a choice", () => {
    expect(onlyOccupancy([two[0]])).toBe("o1");
    expect(onlyOccupancy(two)).toBe("");
    expect(onlyOccupancy([])).toBe("");
  });

  it("Transfer and Addition start on the occupancy they were opened for", () => {
    const { occupancies } = cellarTransferPils;
    const chosen = occupancies[1].occupancy_id;
    const transfer = renderToStaticMarkup(createElement(CellarTransferForm, { occupancies, vessels: cellarTransferPils.vessels, fromId: chosen }));
    expect(transfer).toContain(`Remainder in ${occupancies[1].vessel_name}`);
    const addition = renderToStaticMarkup(createElement(CellarAdditionForm, { occupancies, materials: cellarAdditionCitra.materials, lotsByMaterial: cellarAdditionCitra.lotsByMaterial, occupancyId: chosen }));
    expect(addition).not.toContain("a tank");
  });
});

describe("item 9: Complete batch leads with one loss line", () => {
  const preview = { residualBbl: 3.2, thresholdBbl: 0.075 };
  it("names the write-off at or above the threshold, and none below it", () => {
    expect(completionLoss(preview)).toBe("Loss written off: 3.2 bbl");
    expect(completionLoss({ residualBbl: 0.075, thresholdBbl: 0.075 })).toBe("Loss written off: 0.075 bbl");
    expect(completionLoss({ residualBbl: 0.04, thresholdBbl: 0.075 })).toBe("Loss written off: none (0.04 bbl is under the 0.075 bbl threshold)");
  });
});

describe("item 6: Close packaging run starts from the planned draw", () => {
  it("sums planned packages by their barrels per unit, or knows none when a volume is unknown", () => {
    expect(plannedDrawBbl([{ qty: 100, bblPerUnit: 0.0645 }, { qty: 4, bblPerUnit: 0.5 }])).toBeCloseTo(8.45, 8);
    expect(plannedDrawBbl([{ qty: 0, bblPerUnit: undefined }, { qty: 2, bblPerUnit: 0.5 }])).toBe(1);
    expect(plannedDrawBbl([{ qty: 2, bblPerUnit: undefined }])).toBeUndefined();
  });
});

describe("item 8: New batch starts today and takes the recipe's brand", () => {
  it("fills the brand from the recipe only while none is chosen", () => {
    expect(brandAfterRecipePick("", "brand-a")).toBe("brand-a");
    expect(brandAfterRecipePick("brand-b", "brand-a")).toBe("brand-b");
    expect(brandAfterRecipePick("", null)).toBe("");
  });

  it("opens on the brewery's today", () => {
    const html = renderToStaticMarkup(createElement(NewBatchForm, { brands: [], recipeVersions: [], today: "2026-10-28", brandsHref: null }));
    expect(html).not.toContain("a date");
  });
});

describe("item 10: the reading sheet is quieter", () => {
  const values = { observedAt: "2026-09-10T08:10:00", tempF: "", gravity: "", ph: "", note: "" };
  const html = renderToStaticMarkup(createElement(FermentationReadingView, { formId: "f", values, identity: { vessel: "FV3" }, unit: "sg", timeZone: "America/New_York", prior: { tempF: "67.8", gravity: "1.021", ph: "4.21" } }));
  it("shows each prior value as its field's placeholder, not a line under it", () => {
    expect(html).not.toContain("Prior 67.8 °F");
    expect(html).toContain('placeholder="Prior 67.8"');
    expect(html).toContain('placeholder="Prior 1.021"');
    expect(html).toContain('placeholder="Prior 4.21"');
  });
  it("folds the observation time behind Change", () => {
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Observed Sep 10, 2026, 8:10 AM · Change<\/summary>/);
  });
});
