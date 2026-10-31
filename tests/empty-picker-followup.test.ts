// #1123: remaining empty pickers expose recovery without making optional intent required.
import { createElement } from "react";
import type * as ReactModule from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("react", async original => ({ ...await original<typeof ReactModule>(), useState: () => [false, () => {}], useId: () => "empty-pick-test" }));
import { OrderSkuPicker } from "@/components/mgr/views/new-order";
import { ScheduleBatchView } from "@/components/mgr/views/schedule-batch";
import { WaterAdditionView } from "@/components/mgr/views/water";
import { BrandView } from "@/components/mgr/views/brand";
import { toBrandViewProps } from "@/lib/mgr/brand-view";
import { brandHazy } from "@/lib/mgr/fixtures/catalog";
import { scheduleBatchHazy } from "@/lib/mgr/fixtures/production";

it("distinguishes an empty order SKU catalog from search misses and pending reads", () => {
  const props = { value: "", label: "SKU", options: [], catalogHref: "/catalog" };
  const empty = renderToStaticMarkup(OrderSkuPicker(props).props.children);
  expect(empty).toContain("No active SKUs yet.");
  expect(empty).toContain('href="/catalog"');
  expect(empty).toContain("Add a SKU");
  expect(empty).not.toContain("No matching SKUs");
  expect(renderToStaticMarkup(OrderSkuPicker({ ...props, options: [{ id: "sku", label: "Keg" }] }).props.children)).toContain("No matching SKUs");
  expect(renderToStaticMarkup(OrderSkuPicker({ ...props, optionsReady: false }).props.children)).not.toContain("No active SKUs yet.");
  expect(renderToStaticMarkup(OrderSkuPicker({ ...props, emptyMessage: "No active SKUs are priced for this customer." }).props.children)).not.toContain("Add a SKU");
});

it("keeps other order callers selection-neutral when they supply a filtered list", () => {
  const html = renderToStaticMarkup(OrderSkuPicker({ value: "", label: "SKU", options: [] }).props.children);
  expect(html).toContain("No SKUs available for this order.");
  expect(html).not.toContain("No active SKUs yet");
  expect(html).not.toContain("Add a SKU");
});

it("keeps batch intent optional while exposing eligible recipe and role-safe brand recovery", () => {
  const model = { ...scheduleBatchHazy, recipeId: "", brandId: "", recipeOptions: [], brandOptions: [], recipesHref: "/recipes", brandsHref: null };
  const html = renderToStaticMarkup(createElement(ScheduleBatchView, { model }));
  expect(html).toContain("No recipe versions available.");
  expect(html).toContain('href="/recipes"');
  expect(html).not.toContain('href="/catalog"');
  expect(html).toContain("Not decided");
  for (const label of ["Recipe · optional", "Brand · optional"]) {
    const trigger = html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0];
    expect(trigger).toBeDefined();
    expect(trigger).not.toMatch(/required/);
  }
  const permitted = renderToStaticMarkup(createElement(ScheduleBatchView, { model: { ...model, brandsHref: "/catalog" } }));
  expect(permitted).toContain('href="/catalog"');
  const populated = renderToStaticMarkup(createElement(ScheduleBatchView, { model: scheduleBatchHazy }));
  expect(populated).not.toContain("No recipe versions available");
  expect(populated).not.toContain("No brands yet");
});

it("water additions reuse ingredient material recovery outside the picker", () => {
  const html = renderToStaticMarkup(createElement(WaterAdditionView, { fields: { materialId: "", qty: "", unit: "g", stage: "mash" }, materials: [], materialsHref: "/materials" }));
  expect(html).toContain("No materials yet.");
  expect(html).toContain('href="/materials"');
  expect(html).toContain("Add a material");
  expect(html).toContain("Salt or acid");
  // A real browser anchor opens setup separately rather than navigating away from the unsaved recipe.
  const recovery = html.match(/<a[^>]*href="\/materials"[^>]*>/)?.[0];
  expect(recovery).toContain('target="_blank"');
  expect(recovery).toContain('rel="noopener"');
  const inventory = renderToStaticMarkup(createElement(WaterAdditionView, { fields: { materialId: "", qty: "", unit: "g", stage: "mash" }, materials: [] }));
  expect(inventory).toContain('href="#"');
  expect(inventory).not.toContain('target="_blank"');
  const populated = renderToStaticMarkup(createElement(WaterAdditionView, { fields: { materialId: "", qty: "", unit: "g", stage: "mash" }, materials: [{ id: "salt", name: "Brewing salt" }] }));
  expect(populated).not.toContain("No materials yet");
});

it("new brands name the optional no-group choice and link to price-group setup", () => {
  const model = toBrandViewProps({ ...brandHazy, brand: { ...brandHazy.brand, id: "", price_group_id: "" }, priceGroups: [] });
  expect(model.priceGroup).toBe(model.priceGroupOptions[0].value);
  const html = renderToStaticMarkup(createElement(BrandView, { model, pricingHref: "/pricing" }));
  expect(html).toContain("No price group");
  expect(html).toContain("No price groups yet.");
  expect(html).toContain('href="/pricing"');
});
