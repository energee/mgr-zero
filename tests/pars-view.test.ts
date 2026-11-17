import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReplenishmentView } from "../components/mgr/views/replenishment";
import { replenishmentDemo } from "../lib/mgr/fixtures/replenishment";
import type { ReplenishmentViewModel } from "../lib/mgr/replenishment-view";
import { parsPils } from "../lib/mgr/fixtures/pars";
import { toParsViewProps } from "../lib/mgr/pars-view";
import { OUNCES_PER_BBL } from "../lib/volume";

describe("Pars view", () => {
  it("maps signed ATP and reservation priority from the shortfall snapshot", () => {
    const model = toParsViewProps(parsPils);
    expect(model.atp).toBe("−6 cases · −18 gal");
    expect(model.rows[0]?.tone).toBe("attention");
    expect(model.rows[1]?.tone).toBe("destructive");
  });

  it("formats the unrounded volume: one short can is −12 oz, one short sixth is −⅙ bbl (#456)", () => {
    const one = (bblPerUnit: number, unit: string) => toParsViewProps({ ...parsPils, bblPerUnit, unit, shortfall: { ...parsPils.shortfall, atp: -1 } }).atp;
    expect(one(12 / OUNCES_PER_BBL, "can")).toBe("−1 can · −12 oz");
    expect(one(1 / 6, "sixth")).toBe("−1 sixth · −⅙ bbl");
  });

  it("Warehouse can inspect every section without mutation controls", () => {
    const html = renderToStaticMarkup(createElement(ReplenishmentView, {
      model: { ...replenishmentDemo, canEdit: false },
      fromLocationId: "lantern-warehouse",
      qtys: { "lantern-pils-case": "6" },
    }));
    for (const label of ["Set taproom par", "Set standing allocation", "Create replenishment order"]) {
      expect(html).not.toContain(label);
    }
    expect(html).not.toMatch(/<button[^>]*>Release<\/button>/);
    expect(html).not.toMatch(/<input\b(?![^>]*\bdisabled\b)[^>]*>/);
  });

  it.each([
    ["no taprooms", { locationId: null, locationName: null, locations: [], sources: [], suggestions: [], allocations: [] }],
    ["no pars", { suggestions: [] }],
    ["no standing allocations", { allocations: [] }],
    ["no shortfalls", { shortfalls: [] }],
    ["no source", { sources: [] }],
    ["filtered SKU without shortfall", { skuFilter: "lantern-pils-case", shortfalls: [], allShortfallsHref: "#" }],
  ] satisfies [string, Partial<ReplenishmentViewModel>][])("keeps %s fixture navigation away from live mutation routes", (_name, patch) => {
    const html = renderToStaticMarkup(createElement(ReplenishmentView, {
      model: { ...replenishmentDemo, ...patch },
      fromLocationId: "",
      qtys: {},
    }));
    expect(html).not.toMatch(/href="\/(?:inventory|replenishment|orders)/);
  });
});
