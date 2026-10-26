import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkList } from "../app/(app)/work/work-list";
import { SCREENS } from "../components/mgr/screens";
import { PickSheetView } from "../components/mgr/views/pick-sheet";
import { ReplenishmentView } from "../components/mgr/views/replenishment";
import { workHrefsFor } from "../components/mgr/work-tabs";
import { toPickSheetViewProps } from "../lib/mgr/pick-sheet-view";
import { toWorkViewProps } from "../lib/mgr/work-view";

const replenishment = {
  backHref: "/work", locationId: null, locationName: null,
  locations: [], warehouses: [], suggestions: [], allocations: [], shortfalls: [], canEdit: false,
};

describe("Work task layout (#1259)", () => {
  it.each(["Pick", "Replenishment"])("uses the sidebar heading, Work back link, and selected navigation on %s", (title) => {
    const workHrefs = workHrefsFor(["warehouse"]);
    const view = title === "Pick"
      ? createElement(PickSheetView, { model: toPickSheetViewProps({ orders: [] }), backHref: "/work", workHrefs, filters: null })
      : createElement(ReplenishmentView, { model: replenishment, fromLocationId: "", qtys: {}, workHrefs });
    const html = renderToStaticMarkup(view);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${title}</h1>`));
    expect(html).toMatch(/<a[^>]*href="\/work"[^>]*>(?:(?!<\/a>)[\s\S])*Work<\/a>/);
    expect(html).not.toContain("Finished goods");
    const selected = [...html.matchAll(/<a\b[^>]*role="tab"[^>]*>(.*?)<\/a>/g)]
      .filter(([tag]) => tag.includes('aria-selected="true"'));
    expect(selected.map(([, text]) => text)).toEqual([title]);
    expect(html).toContain('href="/pick"');
    expect(html).toContain('href="/replenishment"');
  });

  it.each([["Pick sheet", "Pick"], ["Pars and allocation", "Replenishment"]])("keeps %s inventory on the same task view with inert navigation", (name, title) => {
    const html = renderToStaticMarkup(createElement("div", null, SCREENS.find(screen => screen.name === name)!.body));
    expect(html).toMatch(new RegExp(`<h1[^>]*>${title}</h1>`));
    expect(html).toContain('role="tablist"');
    expect(html).not.toMatch(/href="\/(?:work|pick|replenishment)"/);
  });

  it("keeps task navigation role-filtered without adding nonexistent Work result kinds", () => {
    expect(workHrefsFor(["warehouse"])).toMatchObject({ pick: "/pick", replenishment: "/replenishment" });
    expect(workHrefsFor(["sales"]).pick).toBeUndefined();
    expect(workHrefsFor(["sales"]).replenishment).toBe("/replenishment");
    expect(workHrefsFor(["brewer"]).replenishment).toBeUndefined();
    expect(toWorkViewProps({ rows: [] }).workChips).not.toContain("pick");
    expect(toWorkViewProps({ rows: [] }).workChips).not.toContain("replenishment");
    const html = renderToStaticMarkup(createElement(WorkList, {
      rows: [], defaults: ["orders"], createAction: null, chips: Object.keys(workHrefsFor(["warehouse"])),
    }));
    expect(html).toContain('href="/pick"');
    expect(html).toContain('href="/replenishment"');
    const sales = renderToStaticMarkup(createElement(WorkList, {
      rows: [], defaults: ["orders"], createAction: null, chips: Object.keys(workHrefsFor(["sales"])),
    }));
    expect(sales).not.toContain('href="/pick"');
    expect(sales).toContain('href="/replenishment"');
  });

  it("draws the inventory Work navigation in the shared filter bar without live destinations", () => {
    const html = renderToStaticMarkup(createElement("div", null, SCREENS.find(screen => screen.name === "Work")!.body));
    expect(html.match(/role="tablist"/g)).toHaveLength(1);
    expect(html).toMatch(/<a\b[^>]*href="#"[^>]*>Pick<\/a>/);
    expect(html).toMatch(/<a\b[^>]*href="#"[^>]*>Replenishment<\/a>/);
    expect(html).not.toMatch(/href="\/(?:pick|replenishment)"/);
  });
});
