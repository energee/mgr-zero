import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { ReplenishmentDemo } from "../components/mgr/replenishment-demo";
import { ReplenishmentView } from "../components/mgr/views/replenishment";
import { replenishmentDemo } from "../lib/mgr/fixtures/replenishment";
import type { ReplenishmentViewModel } from "../lib/mgr/replenishment-view";
import { parsPils } from "../lib/mgr/fixtures/pars";
import { toParsViewProps } from "../lib/mgr/pars-view";
import { OUNCES_PER_BBL } from "../lib/volume";

describe("Pars view", () => {
  it("maps ATP −6 and Adjust/Release verbs from the shortfall snapshot", () => {
    const model = toParsViewProps(parsPils);
    expect(model.title).toBe("Pils · 16 oz case");
    expect(model.atp).toBe("−6 cases · −18 gal");
    expect(model.atpDetail).toBe("Available · 22 cases on hand · 28 allocated");
    expect(model.rows.map((r) => r.verb)).toEqual(["Adjust", "Release", "Edit", "Edit par"]);
    expect(model.rows[0]?.title).toMatch(/^ORD-0231 · Ridgeline/);
    expect(model.rows[0]?.tone).toBe("attention");
    expect(model.rows[1]?.title).toMatch(/^ORD-0234 · Teresa/);
    expect(model.rows[1]?.tone).toBe("destructive");
    expect(model.rows[2]?.title).toBe("Taproom standing");
    expect(model.rows[3]?.title).toBe("Taproom par");
  });

  it("formats the unrounded volume: one short can is −12 oz, one short sixth is −⅙ bbl (#456)", () => {
    const one = (bblPerUnit: number, unit: string) => toParsViewProps({ ...parsPils, bblPerUnit, unit, shortfall: { ...parsPils.shortfall, atp: -1 } }).atp;
    expect(one(12 / OUNCES_PER_BBL, "can")).toBe("−1 can · −12 oz");
    expect(one(1 / 6, "sixth")).toBe("−1 sixth · −⅙ bbl");
  });

  it("the inventory mounts the complete shared replenishment view through its controlled adapter", () => {
    const body = SCREENS.find(screen => screen.name === "Pars and allocation")!.body;
    expect(isValidElement(body)).toBe(true);
    const demo = body as ReactElement<{ children: ReactElement<{ model: unknown }> }>;
    expect(demo.type).toBe(ReplenishmentDemo);
    expect(demo.props.children.type).toBe(ReplenishmentView);
    expect(demo.props.children.props.model).toBe(replenishmentDemo);
    expect(replenishmentDemo.suggestions).toHaveLength(3);
    expect(replenishmentDemo.allocations).toHaveLength(1);
    expect(replenishmentDemo.shortfalls[0].detail.rows.map(row => row.verb)).toEqual(["Review", "Review"]);
  });

  it("the inventory draws one replenishment page with local controls and no live destinations", () => {
    const body = SCREENS.find(screen => screen.name === "Pars and allocation")!.body;
    const html = renderToStaticMarkup(createElement("div", null, body));
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain(">Replenishment<");
    expect(html.indexOf(">Taproom replenishment<")).toBeLessThan(html.indexOf(">Standing allocations<"));
    expect(html.indexOf(">Standing allocations<")).toBeLessThan(html.indexOf(">Shortfalls across all locations<"));
    expect(html).not.toMatch(/href="\/(?:inventory|replenishment|orders)/);
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
    expect(html).toContain("Standing allocations");
    expect(html).toContain("Shortfalls across all locations");
    const quantities = [...html.matchAll(/<input\b[^>]*type="number"[^>]*>/g)];
    expect(quantities.length).toBeGreaterThan(0);
    for (const [input] of quantities) expect(input).toContain("disabled");
  });

  it.each([
    ["no taprooms", { locationId: null, locationName: null, locations: [], warehouses: [], suggestions: [], allocations: [] }, "Locations"],
    ["no pars", { suggestions: [] }, "No pars set for this taproom."],
    ["no standing allocations", { allocations: [] }, "Standing allocations"],
    ["no shortfalls", { shortfalls: [] }, "No current shortfalls across all locations."],
    ["missing warehouse", { warehouses: [] }, "No other location has the Warehouse use."],
    ["filtered SKU without shortfall", { skuFilter: "lantern-pils-case", shortfalls: [], allShortfallsHref: "#" }, "This SKU has no current shortfall."],
  ] satisfies [string, Partial<ReplenishmentViewModel>, string][])("renders the %s state without inventing data", (_name, patch, message) => {
    const html = renderToStaticMarkup(createElement(ReplenishmentView, {
      model: { ...replenishmentDemo, ...patch },
      fromLocationId: "",
      qtys: {},
    }));
    expect(html).toContain(message);
    expect(html).not.toMatch(/href="\/(?:inventory|replenishment|orders)/);
  });
});
