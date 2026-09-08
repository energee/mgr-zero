// tests/pricing-view.test.ts — Price groups and Price group adapters plus
// HTML. Views own no sample data.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { PriceGroupView } from "../components/mgr/views/price-group";
import { PriceGroupsView } from "../components/mgr/views/price-groups";
import { priceGroupTwo, pricingGrid } from "../lib/mgr/fixtures/pricing";
import { money } from "../lib/mgr/money";
import { toPriceGroupViewProps } from "../lib/mgr/price-group-view";
import { toPriceGroupsViewProps } from "../lib/mgr/price-groups-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("Price groups view", () => {
  it("maps the four list_* snapshots onto Wholesale and Taproom tables", () => {
    const model = toPriceGroupsViewProps(pricingGrid);
    expect(model.channels.map((c) => c.name)).toEqual(["Wholesale", "Taproom"]);
    expect(model.channels[0]?.headers).toEqual(["Group", "½ bbl keg", "sixtel", "case · 24×16oz"]);
    expect(model.channels[1]?.headers).toEqual(["Group", "pint", "crowler"]);
    expect(model.channels[0]?.rows).toEqual([
      ["1", "$132.00", "$53.00", "$46.00"],
      ["2", money(15000), "$95.00", money(3800)],
      ["3", "$240.00", "$140.00", "not priced"],
    ]);
    expect(model.channels[1]?.rows).toEqual([
      ["1", "$7.00", "$14.00"],
      ["2", "$8.00", "$16.00"],
      ["3", "$11.00", "not priced"],
    ]);
  });

  it("renders Create price group, group links, and the Hazy / Pils cells", () => {
    const html = htmlOf(createElement(PriceGroupsView, { model: toPriceGroupsViewProps(pricingGrid) }));
    expect(html).toMatch(/>Create price group</);
    expect(html).toMatch(/Wholesale/);
    expect(html).toMatch(/Taproom/);
    expect(html).toMatch(/data-to="Price group"/);
    expect(html).toContain(money(15000));
    expect(html).toContain(money(3800));
    expect(html).toMatch(/not priced/);
    expect(html).toMatch(/½ bbl keg/);
    expect(html).toMatch(/case · 24×16oz/);
    expect(html).not.toMatch(/→/);
  });

  it("createAction and tables replace the inventory button and both tables", () => {
    const html = htmlOf(createElement(PriceGroupsView, {
      model: toPriceGroupsViewProps(pricingGrid),
      createAction: "CREATE",
      tables: "LIVE TABLES",
    }));
    expect(html).toMatch(/CREATE/);
    expect(html).not.toMatch(/Create price group/);
    expect(html).toMatch(/LIVE TABLES/);
    expect(html).not.toContain(money(15000));
    expect(html).not.toMatch(/not priced/);
    expect(html).toMatch(/one table per sale channel/);
    expect(html).toMatch(/empty cell is unpriced/);
  });

  it("the Price groups inventory record is PriceGroupsView", () => {
    const body = screen("Price groups").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Price groups").body)).toBe(true);
    expect(body.type).toBe(PriceGroupsView);
    expect(body.props.model).toEqual(toPriceGroupsViewProps(pricingGrid));
  });

  it("the live pricing page mounts PriceGroupsView", () => {
    const src = readFileSync("app/(app)/pricing/page.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/price-groups"/);
    expect(src).toMatch(/<PriceGroupsView\b/);
    expect(src).toMatch(/<GroupForm\b/);
    expect(src).toMatch(/<PriceCellForm\b/);
  });
});

describe("Price group view", () => {
  it("maps group 2's ceiling, previous none, and the Hazy featured cell", () => {
    const model = toPriceGroupViewProps(priceGroupTwo);
    expect(model.name).toBe("2");
    expect(model.position).toBe("2");
    expect(model.costCeiling).toBe(money(185));
    expect(model.previousCeilingLabel).toBe("Cost ceiling · group 1");
    expect(model.previousCeiling).toBe("none");
    expect(model.prices).toBe(`${money(15000)} on Wholesale · ½ bbl keg, and 4 more cells`);
    expect(model.removeDetail).toMatch(/refused/);
  });

  it("renders the inventory edits, Prices line, and refused Remove", () => {
    const html = htmlOf(createElement(PriceGroupView, { model: toPriceGroupViewProps(priceGroupTwo) }));
    expect(html).toMatch(/Group name/);
    expect(html).toMatch(/Position/);
    expect(html).toMatch(/Cost ceiling/);
    expect(html).toContain(money(185));
    expect(html).toMatch(/Cost ceiling · group 1/);
    expect(html).toMatch(/none/);
    expect(html).toContain(`${money(15000)} on Wholesale · ½ bbl keg, and 4 more cells`);
    expect(html).toMatch(/>Remove</);
    expect(html).toMatch(/refused while a brand sits on it/);
    expect(html).not.toMatch(/→/);
  });

  it("the Price group inventory record is PriceGroupView", () => {
    const body = screen("Price group").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(PriceGroupView);
    expect(body.props.model).toEqual(toPriceGroupViewProps(priceGroupTwo));
  });
});
