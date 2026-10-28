import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CatalogView } from "../components/mgr/views/catalog";
import { SCREENS } from "../components/mgr/screens";
import { ScreenSheet } from "../components/mgr/screen-frame";
import { ShipToView } from "../components/mgr/views/ship-to";
import { ListControls, searchHref } from "../components/mgr/list-controls";
import { toCatalogViewProps } from "../lib/mgr/catalog-view";
import { toBrandViewProps } from "../lib/mgr/brand-view";
import { toFormatsViewProps } from "../lib/mgr/formats-view";
import { toCustomersViewProps } from "../lib/mgr/customers-view";
import { brandHazy, catalogBrands, formatsInventory } from "../lib/mgr/fixtures/catalog";
import { customersList, shipToMain } from "../lib/mgr/fixtures/customers";
import { toShipToViewProps } from "../lib/mgr/ship-to-view";

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);

describe("More page consistency", () => {
  it("keeps Formats below Catalog in the heading outline", () => {
    const markup = html(createElement(CatalogView, { model: toCatalogViewProps(catalogBrands), formats: toFormatsViewProps(formatsInventory) }));
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(markup).toMatch(/<h2\b[^>]*>Formats<\/h2>/);
  });

  it("preserves other filters when submitting or clearing a URL-backed search", () => {
    const markup = html(createElement(ListControls, { search: { label: "Search brands or aliases", value: "Hazy", keep: { category: "Core", sort: "abv" } } }));
    expect(markup).toContain('name="category" value="Core"');
    expect(markup).toContain('name="sort" value="abv"');
    expect(markup).toContain('href="?category=Core&amp;sort=abv"');
  });

  it("searches as you type, so the box carries no Press Enter hint (#1512)", () => {
    const markup = html(createElement(ListControls, { search: { label: "Search customers", value: "", keep: {} } }));
    expect(markup).not.toContain("Press Enter");
    // Typing replaces the URL with the trimmed query and the other params kept.
    expect(searchHref("/catalog", { category: "Core" }, " hazy ")).toBe("/catalog?category=Core&q=hazy");
    expect(searchHref("/catalog", { category: "Core" }, "   ")).toBe("/catalog?category=Core");
    expect(searchHref("/recipes", {}, "")).toBe("/recipes?");
  });

  it("uses factual missing-COLA language in list, detail badge and compliance row", () => {
    const list = toCatalogViewProps({ ...catalogBrands, brands: [{ ...catalogBrands.brands[0]!, colas: [] }] });
    const detail = toBrandViewProps({ ...brandHazy, compliance: { approvals: [], registrations: [] } });
    expect(list.brands[0]!.cola).toBe("None on file");
    expect(detail.badges.find(badge => badge.key === "cola")).toMatchObject({ label: "COLA · None on file", tone: "" });
    expect(detail.compliance).toEqual([{ key: "cola-missing", title: "COLA", detail: "None on file" }]);
  });

  it("capitalizes customer type labels in the list as detail already does", () => {
    expect(toCustomersViewProps(customersList).rows[0]!.detail).toBe("Retailer · PA · 2 portal users");
  });

  it.each([["Vendor", "Edit vendor"], ["Contract", "Edit contract"], ["Ship-to form", "Edit ship-to"], ["License", "Edit license"]])("titles the %s inventory dialog by action", (name, title) => {
    const screen = SCREENS.find(screen => screen.name === name)!;
    expect(ScreenSheet({ screen }).props.title).toBe(title);
  });

  it("leaves the ship-to heading to the shared dialog surface", () => {
    const markup = html(createElement(ShipToView, { model: toShipToViewProps(shipToMain) }));
    expect(markup).not.toMatch(/<h[1-6]\b/);
    expect(markup).toContain("Label");
    expect(markup).toContain("Save ship-to");
  });
});
