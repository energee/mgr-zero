// tests/catalog-view.test.ts — Catalog family adapters plus HTML.
// Views own no sample data.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { BrandView } from "../components/mgr/views/brand";
import { CatalogView } from "../components/mgr/views/catalog";
import { FormatView } from "../components/mgr/views/format";
import { FormatFixture } from "../components/mgr/fixture-adapters";
import { FormatsView } from "../components/mgr/views/formats";
import { PackageBomView } from "../components/mgr/views/package-bom";
import { SkuListView } from "../components/mgr/views/sku-list";
import { SkuView } from "../components/mgr/views/sku";
import {
  brandHazy,
  catalogBrands,
  formatCan,
  formatsInventory,
  packageBomCase,
  skuHazyHalf,
  skuListHazy,
} from "../lib/mgr/fixtures/catalog";
import { SKU_HAZY, SKU_PILS, SKU_STOUT } from "../lib/mgr/fixtures/demo";
import { brandLabel, toBrandViewProps, UNPRICED } from "../lib/mgr/brand-view";
import { toCatalogViewProps } from "../lib/mgr/catalog-view";
import { toFormatViewProps } from "../lib/mgr/format-view";
import { toFormatsViewProps } from "../lib/mgr/formats-view";
import { toPackageBomViewProps } from "../lib/mgr/package-bom-view";
import { toSkuListViewProps } from "../lib/mgr/sku-list-view";
import { barcodeOf } from "../lib/mgr/price-groups-view";
import { toSkuViewProps } from "../lib/mgr/sku-view";
import { resolveTap } from "../lib/mgr/screen-links";
import { formatVolume } from "../lib/volume";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const brandOf = (sku: { name: string }) => sku.name.split(" · ")[0];
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("Catalog view", () => {
  it("maps list_brands onto separate style, ABV and SKU count fields", () => {
    const model = toCatalogViewProps(catalogBrands);
    expect(model.brands.map(({ name, style, abv, skus }) => [name, style, abv, skus])).toEqual([
      [brandOf(SKU_HAZY), "IPA", "6.8%", "4"],
      [brandOf(SKU_PILS), "Lager", "4.9%", "2"],
      [brandOf(SKU_STOUT), "Stout", "7.2%", "1"],
    ]);
    // The name is the link to that brand's page; Catalog draws no Edit brand button.
    expect(model.brands[0]?.href).toBe(`/catalog/brands/${model.brands[0]!.key}`);
    expect(model.priceGroups).toBe("3 channels · 8 groups");
    expect(model.waterProfiles).toBe("3 profiles");
    expect(model.backHref).toBeUndefined();
  });

  it("says Not set for a missing style or ABV, and keeps a real zero ABV and zero SKUs", () => {
    const model = toCatalogViewProps({ priceGroups: [], brands: [
      { id: "unset", name: "Unset", abv: null, styles: null, skus: [] },
      { id: "blank", name: "Blank", abv: "", styles: null, skus: [] },
      { id: "zero", name: "Zero", abv: "0.00", styles: { name: "Non-alcoholic" }, skus: [] },
    ] });
    expect(model.brands.map(({ style, abv, skus }) => [style, abv, skus])).toEqual([
      ["Not set", "Not set", "0"],
      ["Not set", "Not set", "0"],
      ["Non-alcoholic", "0%", "0"],
    ]);
  });

  it("keeps a brand's staff-only alias apart from its name (brand-alias.md)", () => {
    // Pickers and the brand page title still join the two.
    expect(brandLabel({ name: "Appaloosa", alias: "Animal #14" })).toBe("Appaloosa · Animal #14");
    expect(brandLabel({ name: "Lupula", alias: null })).toBe("Lupula");
    expect(brandLabel({ name: "Lupula" })).toBe("Lupula");
    const [first, second, third] = catalogBrands.brands;
    const model = toCatalogViewProps({ ...catalogBrands, brands: [{ ...first!, alias: "Animal #14" }, { ...second!, alias: null }, { ...third!, alias: "" }] });
    expect(model.brands.map(({ name, alias }) => [name, alias])).toEqual([
      [first!.name, "Animal #14"],
      [second!.name, undefined],
      [third!.name, undefined],
    ]);
  });

  it("draws brands as a table whose Brand cell links the name, with the alias under it", () => {
    const [first, ...rest] = catalogBrands.brands;
    const model = toCatalogViewProps({ ...catalogBrands, brands: [{ ...first!, alias: "Animal #14" }, ...rest] });
    const html = htmlOf(createElement(CatalogView, { model, linkRows: true }));
    expect([...html.matchAll(/<th\b[^>]*>(.*?)<\/th>/g)].map((m) => m[1])).toEqual(["Brand", "Style", "ABV", "SKUs"]);
    // One link per brand in the desktop table, then one in the phone list, each named by the brand alone.
    const links = [...html.matchAll(/<a\b[^>]*href="(\/catalog\/brands\/[^"]+)"[^>]*>(.*?)<\/a>/g)].map((m) => [m[1], m[2]]);
    expect(links).toEqual([...model.brands, ...model.brands].map((b) => [b.href, b.name]));
    expect(html.match(/Animal #14/g)).toHaveLength(2);
    expect(html).not.toMatch(/Staff alias|→/);
    // The phone list labels every fact under its header and draws no box per record.
    const records = html.split(/data-slot="item"(?=[\s>])/).slice(1).filter((chunk) => /^[^>]*role="listitem"/.test(chunk));
    expect(records).toHaveLength(model.brands.length);
    for (const record of records) {
      expect([...record.matchAll(/<dt\b[^>]*>(.*?)<\/dt>/g)].map((m) => m[1])).toEqual(["Style", "ABV", "SKUs"]);
      expect(record).toMatch(/data-variant="default"/);
    }
  });

  it("the brand page carries and draws the alias field", () => {
    const model = toBrandViewProps({ ...brandHazy, brand: { ...brandHazy.brand, alias: "Animal #14" } });
    expect(model.alias).toBe("Animal #14");
    expect(toBrandViewProps(brandHazy).alias).toBe("");
    const html = renderToStaticMarkup(createElement(BrandView, { model }));
    expect(html).toContain("Alias");
    expect(html).toContain("Animal #14");
  });

  it("omits water profiles when the snapshot has no count", () => {
    const model = toCatalogViewProps({
      brands: catalogBrands.brands,
      priceGroups: catalogBrands.priceGroups,
      channels: catalogBrands.channels,
    });
    expect(model.waterProfiles).toBeUndefined();
    const html = htmlOf(createElement(CatalogView, { model }));
    expect(html).not.toMatch(/Water profiles/);
    expect(html).toMatch(/Price groups/);
  });

  // docs/plans/list-filters.md: an empty search is not an empty catalog.
  it("says no brands match, not no brands yet, when a filter is on", () => {
    const model = toCatalogViewProps({ ...catalogBrands, brands: [], filtered: true });
    expect(model.empty).toEqual({ title: "No brands match", description: "Clear the search or category to see every brand." });
    expect(toCatalogViewProps({ ...catalogBrands, brands: [] }).empty?.title).toBe("No brands yet");
  });

  it("draws the controls slot above the brand rows", () => {
    const html = htmlOf(createElement(CatalogView, { model: toCatalogViewProps(catalogBrands), controls: createElement("form", { role: "search" }) }));
    expect(html.indexOf('role="search"')).toBeGreaterThan(-1);
    expect(html.indexOf('role="search"')).toBeLessThan(html.indexOf(brandOf(SKU_HAZY)));
  });

  it("renders Add brand, Hazy IPA, Price groups, and Water profiles", () => {
    const html = htmlOf(createElement(CatalogView, { model: toCatalogViewProps(catalogBrands) }));
    expect(html).toMatch(/>Add brand</);
    expect(html).toContain(brandOf(SKU_HAZY));
    for (const fact of [">IPA<", ">6.8%<", ">4<"]) expect(html).toContain(fact);
    expect(html).toMatch(/Price groups/);
    expect(html).toMatch(/3 channels · 8 groups/);
    expect(html).toMatch(/Water profiles/);
    expect(html).toMatch(/3 profiles/);
    expect(html).not.toMatch(/→/);
  });

  it("createAction, footer, and linkRows slot for live Catalog", () => {
    const html = htmlOf(createElement(CatalogView, {
      model: toCatalogViewProps(catalogBrands),
      createAction: "NEW BRAND",
      footer: "FORMATS SLOT",
      linkRows: true,
    }));
    expect(html).toMatch(/NEW BRAND/);
    expect(html).not.toMatch(/>Add brand</);
    expect(html).toMatch(/FORMATS SLOT/);
    expect(html).toMatch(/href="\/pricing"/);
    expect(html).toContain(brandOf(SKU_HAZY));
  });

  it("draws one entry per brand without separate pour rows", () => {
    const model = toCatalogViewProps(catalogBrands);
    const html = htmlOf(createElement(CatalogView, {
      model,
      linkRows: true,
    }));
    // The shared view still owns the rows: the slot cannot replace them.
    expect(html).toContain(brandOf(SKU_HAZY));
    expect(html).toContain(brandOf(SKU_PILS));
    expect(html).toContain(">4<");
    expect(html).not.toMatch(/New pour|never a SKU/);
    expect(html).toMatch(/href="\/catalog\/brands\//);
  });

  it("still blanks an empty catalog", () => {
    const html = htmlOf(createElement(CatalogView, {
      model: toCatalogViewProps({ brands: [], priceGroups: catalogBrands.priceGroups }),
    }));
    expect(html).toMatch(/No brands yet/);
    // The blank carries a title plus a sentence saying what to do next.
    expect(html).toMatch(/Add a brand to start building the catalog/);
    expect(html).not.toMatch(/POUR SLOT/);
  });

  it("the Catalog inventory record is CatalogView", () => {
    const body = screen("Catalog").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Catalog").body)).toBe(true);
    expect(body.type).toBe(CatalogView);
    expect(body.props.model).toEqual(toCatalogViewProps(catalogBrands));
    const html = htmlOf(screen("Catalog").body);
    // Formats has no tagline under its title, and its names are the links: no repeated Open format.
    expect(html).not.toContain("Shared sizes and packaging for every brand");
    expect(html).not.toContain("Open format");
    expect(html).toMatch(/<a\b[^>]*>½ bbl keg<\/a>/);
    expect(html).toContain('placeholder="Search brands or aliases"');
  });

  it("a brand or format name opens its screen in the explorer", () => {
    const packaged = formatsInventory.formats.filter((format) => format.basis === "packaged");
    for (const row of toFormatsViewProps({ ...formatsInventory, formats: packaged }).rows) expect(resolveTap(screen("Catalog"), row.cells[0]!), row.cells[0]).toBe("Format");
    for (const row of toFormatsViewProps(formatsInventory).rows) expect(resolveTap(screen("Formats"), row.cells[0]!), row.cells[0]).toBe("Format");
    for (const brand of toCatalogViewProps(catalogBrands).brands) expect(resolveTap(screen("Catalog"), brand.name), brand.name).toBe("Brand");
  });

  it("the live Catalog page mounts CatalogView and the shared FormatsView", () => {
    const src = readFileSync("app/(app)/catalog/page.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/catalog"/);
    expect(src).toMatch(/<CatalogView\b/);
    // Brand is a page, not a dialog: New Brand links to it, as does each row.
    expect(src).not.toMatch(/<BrandForm\b/);
    expect(src).toMatch(/"\/catalog\/brands\/new"/);
    expect(src).toContain("formats={toFormatsViewProps(");
    const shared = readFileSync("components/mgr/views/catalog.tsx", "utf8");
    expect(shared).toMatch(/from "@\/components\/mgr\/views\/formats"/);
    expect(shared).toMatch(/<FormatsView\b/);
    expect(src).not.toMatch(/waterProfileCount/);
    expect(src).toMatch(/backHref: "\/more"/);
    // The page no longer redraws the brand rows or nests packages in them.
    expect(src).not.toMatch(/brands=\{/);
    expect(src).not.toMatch(/<SkuForm\b|<SkuEditForm\b/);
  });
});

describe("Brand view", () => {
  it("uses brewery categories without supplying hardcoded choices", () => {
    expect(toBrandViewProps({ ...brandHazy, categories: ["Taproom only"] }).categoryOptions).toEqual(["Taproom only"]);
    expect(toBrandViewProps({ ...brandHazy, categories: undefined }).categoryOptions).toEqual([]);
    expect(htmlOf(screen("Brand").body as ReactNode)).toContain("Manage categories");
  });
  it("maps list_brands onto style, ABV, category, price group, and SKU list", () => {
    const model = toBrandViewProps(brandHazy);
    expect(model.name).toBe(brandOf(SKU_HAZY));
    expect(model.style).toBe(brandOf(SKU_HAZY));
    expect(model.abv).toBe("6.8");
    expect(model.category).toBe("Core");
    expect(model.priceGroup).toBe(brandHazy.brand.price_group_id);
    expect(model.priceGroupOptions[0]).toEqual({ value: UNPRICED, label: "Unpriced" });
    expect(model.suggestion).toMatchObject({ kind: "group", title: "Suggested group 2" });
    expect(model.description).toBe("Juicy, soft, Citra-forward");
    expect(model.hops).toBe("Citra, Mosaic");
    expect(model.skuList).toBe("3 active packages · 1 pour");
    expect(model.styleOptions).toContain("Add “Cold IPA”");
    expect(model.compliance.map((row) => row.title)).toEqual(["COLA TTB ID 25318001000034", "OH registration"]);
    expect(model.compliance[0]).toMatchObject({ detail: "approved 2026-01-15 · serial 260135", verb: "Edit" });
    expect(model.compliance[1]).toMatchObject({ detail: "OH-88214 · expires 2026-12-31", verb: "Edit" });
  });

  it("has no suggestion without a recipe, and Unpriced when on no group", () => {
    const model = toBrandViewProps({ ...brandHazy, cost: undefined, brand: { ...brandHazy.brand, price_group_id: null } });
    expect(model.suggestion).toBeNull();
    expect(model.priceGroup).toBe(UNPRICED);
  });

  it("puts the pending COLA row first even when registrations exist", () => {
    const model = toBrandViewProps({ ...brandHazy, compliance: { approvals: [], registrations: brandHazy.compliance!.registrations } });
    expect(model.compliance.map((row) => row.key)).toEqual(["cola-pending", "oh"]);
  });

  it("flags a brand with no COLA as pending, with nothing to edit", () => {
    const model = toBrandViewProps({ ...brandHazy, compliance: { approvals: [], registrations: [] } });
    expect(model.compliance).toEqual([{ key: "cola-pending", title: "COLA", detail: "pending", warning: true }]);
  });

  it("renders the field row without a React key warning (E.cols owns the keys)", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    htmlOf(createElement(BrandView, { model: toBrandViewProps(brandHazy) }));
    const errors = error.mock.calls.flat().join(" ");
    error.mockRestore();

    expect(errors).not.toContain('unique "key" prop');
  });

  it("renders Save brand, Sell sheet, and SKU list", () => {
    const html = htmlOf(createElement(BrandView, { model: toBrandViewProps(brandHazy) }));
    expect(html).toMatch(/>Save brand</);
    expect(html).toMatch(/Sell sheet/);
    expect(html).toMatch(/SKU list/);
    expect(html).toMatch(/3 active packages/);
    expect(html).toMatch(/Compliance/);
    expect(html).toMatch(/COLA TTB ID 25318001000034/);
    expect(html).toMatch(/OH registration/);
    expect(html).toMatch(/Suggested group 2/);
    expect(html).toMatch(/recipe cost \$48\.10\/bbl/);
    expect(html).toMatch(/>Use</);
    expect(html).toMatch(/>Add approval</);
    expect(html).toMatch(/>Add registration</);
    expect(html).not.toMatch(/Not on file/);
    expect(html).toContain(brandOf(SKU_HAZY));
    expect(html).not.toMatch(/→/);
  });

  it("footer null hides Save brand; linkRows hrefs SKU list", () => {
    const html = htmlOf(createElement(BrandView, {
      model: toBrandViewProps(brandHazy),
      footer: null,
      linkRows: true,
    }));
    expect(html).not.toMatch(/>Save brand</);
    expect(html).toMatch(/href="\/catalog\/brands\/[^"]+\/skus"/);
    expect(html).toMatch(/SKU list/);
  });

  it("titles the page with the saved name and alias, not the typed field", () => {
    const model = toBrandViewProps({ ...brandHazy, brand: { ...brandHazy.brand, alias: "Animal #14" }, saved: { ...brandHazy.brand, alias: "Animal #14" } });
    expect(model.title).toBe("Hazy IPA · Animal #14");
    expect(toBrandViewProps({ ...brandHazy, brand: { ...brandHazy.brand, name: "" }, saved: brandHazy.brand }).title).toBe("Hazy IPA");
    expect(toBrandViewProps({ ...brandHazy, brand: { ...brandHazy.brand, id: "" } }).title).toBe("New brand");
  });

  it("badges COLA state, price group, category, and active SKU count in the header", () => {
    expect(toBrandViewProps(brandHazy).badges).toEqual([
      { key: "group", label: "3", tone: "" },
      { key: "category", label: "Core", tone: "" },
      { key: "skus", label: "3 active packages · 1 pour", tone: "" },
    ]);
    const bare = toBrandViewProps({ ...brandHazy, compliance: { approvals: [], registrations: [] }, brand: { ...brandHazy.brand, price_group_id: null, category: null, skus: [], pours: [] } });
    expect(bare.badges).toEqual([
      { key: "cola", label: "COLA pending", tone: "w", href: "#compliance" },
      { key: "group", label: "Unpriced", tone: "w" },
    ]);
  });

  it("badges the saved price group and category, not the typed ones", () => {
    const typed = { ...brandHazy.brand, price_group_id: null, category: "Seasonal" };
    expect(toBrandViewProps({ ...brandHazy, brand: typed, saved: brandHazy.brand }).badges.map((b) => b.label)).toEqual(["3", "Core", "3 active packages · 1 pour"]);
  });

  it("a new brand is not yet saved: no badges, no SKUs or compliance", () => {
    const model = toBrandViewProps({ ...brandHazy, brand: { ...brandHazy.brand, id: "" } });
    expect(model.isNew).toBe(true);
    expect(model.badges).toEqual([]);
    const html = htmlOf(createElement(BrandView, { model }));
    expect(html).toMatch(/Save the brand to add SKUs and compliance/);
    expect(html).not.toMatch(/SKU list|>Compliance</);
  });

  it("lays the form beside SKUs and Compliance, with Save brand inside the form", () => {
    const html = htmlOf(createElement(BrandView, { model: toBrandViewProps(brandHazy) }));
    const form = html.slice(html.indexOf('aria-label="Brand details"'), html.indexOf('aria-label="SKUs and compliance"'));
    expect(form).toMatch(/Selling/);
    expect(form).toMatch(/>Save brand</);
    expect(form).not.toMatch(/SKU list/);
    expect(html).toMatch(/id="compliance"/);
    expect(html).toMatch(/ABV %/);
  });

  it("the Brand inventory record is BrandView", () => {
    const body = screen("Brand").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(BrandView);
    expect(body.props.model).toEqual(toBrandViewProps(brandHazy));
  });
});

describe("SKU view", () => {
  it("maps list_skus / list_formats onto format, active, and UPC", () => {
    const model = toSkuViewProps(skuHazyHalf);
    expect(model.format).toBe("½ bbl keg");
    expect(model.formatOptions).toEqual(["½ bbl keg", "⅙ bbl keg", "case · 24×16 oz"]);
    expect(model.active).toBe(true);
    expect(model.upc).toBe("00810123450127");
    expect(model.volumeInfo).toMatch(/from the Format/);
  });

  it("renders Save SKU, Active, and the UPC", () => {
    const html = htmlOf(createElement(SkuView, { model: toSkuViewProps(skuHazyHalf) }));
    expect(html).toMatch(/>Save SKU</);
    expect(html).toMatch(/Active/);
    expect(html).toContain("00810123450127");
    expect(html).toMatch(/UPC \(optional\)/);
    expect(html).toMatch(/aria-label="Format"/);
    expect(html).not.toMatch(/→/);
  });

  it("controls make the fields controlled and slots add the live Name", () => {
    const html = htmlOf(createElement(SkuView, {
      model: toSkuViewProps(skuHazyHalf),
      controls: { format: () => {}, active: () => {}, upc: () => {} },
      activeRow: null,
      fields: "NAME FIELD",
      footer: "LIVE FOOTER",
    }));
    expect(html).toMatch(/NAME FIELD/);
    expect(html).toMatch(/LIVE FOOTER/);
    expect(html).not.toMatch(/>Save SKU</);
    expect(html).not.toMatch(/available to price and sell/);
    expect(html).toContain("00810123450127");
  });

  it("a locked SKU shows its format as a fact, not a picker", () => {
    const html = htmlOf(createElement(SkuView, { model: toSkuViewProps(skuHazyHalf), locked: true }));
    expect(html).not.toMatch(/aria-label="Format"/);
    expect(html).toMatch(/½ bbl keg/);
  });

  it("the live SKU forms mount the shared controlled SkuView", () => {
    const form = readFileSync("app/(app)/catalog/sku-form.tsx", "utf8");
    expect(form).toMatch(/from "@\/components\/mgr\/views\/sku"/);
    expect(form.match(/<SkuView\b/g)).toHaveLength(2);
    expect(form).toMatch(/controls=\{\{/);
    // Only the live-only Name input is drawn here; Format, Active and UPC are the view's.
    expect(form).not.toMatch(/<Select\b|<Input\b/);
    expect(form).not.toMatch(/aria-label="UPC/);
  });

  it("the SKU inventory record is SkuView", () => {
    const body = screen("SKU").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(SkuView);
    expect(body.props.model).toEqual(toSkuViewProps(skuHazyHalf));
  });
});

describe("SKU list view", () => {
  it("shows derived package volume and preserves unknown totals", () => {
    const base = skuListHazy.skus[0];
    const model = toSkuListViewProps({ ...skuListHazy, pours: [], skus: [
      { ...base, formats: { name: "Case", bbl_per_unit: null, effective_bbl_per_unit: 384 / 3968 } },
      { ...base, formats: { name: "Unfinished", bbl_per_unit: "0.5", effective_bbl_per_unit: null } },
    ] });
    expect(model.rows.map(row => row.detail)).toEqual(["3 gal · active", "— · active"]);
  });
  it("maps list_skus through formatVolume of ½ / ⅙ / case", () => {
    const model = toSkuListViewProps(skuListHazy);
    expect(model.title).toBe(`${brandOf(SKU_HAZY)} · SKUs`);
    expect(model.rows.map((r) => [r.title, r.detail])).toEqual([
      ["½ bbl keg", `${formatVolume("0.50000000")} · active · No keg pool, no deposit`],
      ["⅙ bbl keg", `${formatVolume("0.16666667")} · active · No keg pool, no deposit`],
      ["case · 24×16 oz", `${formatVolume("0.09677419")} · active`],
      ["Pint", "16 oz · pour · drawn from keg"],
    ]);
  });

  it("shows each SKU's barcode: its own as an override, else its price group's code for the format", () => {
    const [half, sixth, cased] = skuListHazy.skus;
    const barcodes = [
      { price_group_id: "g1", format_id: cased.format_id, upc: "850051366040" },
      { price_group_id: "g1", format_id: half.format_id, upc: "860009737631" },
      // Another group's code for the same format never reaches this brand's rows.
      { price_group_id: "g2", format_id: sixth.format_id, upc: "860009737600" },
    ];
    const model = toSkuListViewProps({ ...skuListHazy, brand: { ...skuListHazy.brand, price_group_id: "g1" }, pours: [],
      skus: [{ ...half, upc: "012345678905" }, sixth, cased], barcodes });
    expect(model.rows.map((r) => r.detail.split(" · ").filter((p) => p.startsWith("UPC")))).toEqual([
      ["UPC 012345678905 (SKU override)"], [], ["UPC 850051366040"],
    ]);
    expect(barcodeOf(barcodes, "g2", sixth.format_id)).toBe("860009737600");
    expect(barcodeOf(barcodes, "g1", sixth.format_id)).toBeUndefined();
    expect(barcodeOf(barcodes, null, cased.format_id)).toBeUndefined();
  });

  it("renders Add SKU, Edit, and the three packages", () => {
    const html = htmlOf(createElement(SkuListView, { model: toSkuListViewProps(skuListHazy) }));
    expect(html).toMatch(/>Add SKU</);
    expect(html).toMatch(/>Edit</);
    expect(html).toMatch(/½ bbl keg/);
    expect(html).toMatch(/⅙ bbl keg/);
    expect(html).toMatch(/case · 24×16 oz/);
    expect(html).toContain(formatVolume("0.50000000"));
    expect(html).not.toMatch(/→/);
  });

  it("createAction replaces Add SKU", () => {
    const html = htmlOf(createElement(SkuListView, {
      model: toSkuListViewProps(skuListHazy),
      createAction: "NEW SKU",
    }));
    expect(html).toMatch(/NEW SKU/);
    expect(html).not.toMatch(/>Add SKU</);
  });

  it("rowAction replaces the inventory Edit tap", () => {
    const html = htmlOf(createElement(SkuListView, {
      model: toSkuListViewProps(skuListHazy),
      rowAction: () => "EDIT SHEET",
    }));
    expect(html).toMatch(/EDIT SHEET/);
    expect(html).not.toMatch(/>Edit</);
    expect(html).toMatch(/½ bbl keg/);
  });

  it("the live SKU list page mounts the shared SkuListView", () => {
    const page = readFileSync("app/(app)/catalog/brands/[id]/skus/page.tsx", "utf8");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/sku-list"/);
    expect(page).toMatch(/<SkuListView\b/);
    expect(page).toMatch(/createAction=\{canWrite \? <SkuForm/);
    expect(page).toMatch(/<SkuEditForm\b/);
    expect(page).toMatch(/backHref: `\/catalog\/brands\/\$\{id\}`/);
  });

  it("the SKU list inventory record is SkuListView", () => {
    const body = screen("SKU list").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(SkuListView);
    expect(body.props.model).toEqual(toSkuListViewProps(skuListHazy));
  });
});

describe("Formats view", () => {
  it("shows the resolved volume and contents without treating a composed format as atomic", () => {
    const formats = [
      { id: "can", name: "16 oz can", basis: "packaged" as const, package_type: "can", bbl_per_unit: 16 / 3968 },
      { id: "four", name: "Four Pack", basis: "packaged" as const, package_type: "can", bbl_per_unit: null, effective_bbl_per_unit: 64 / 3968, components: [{ parent_format_id: "four", child_format_id: "can", qty: 4 }] },
      { id: "unfinished", name: "Unfinished", basis: "packaged" as const, package_type: "can", bbl_per_unit: null, effective_bbl_per_unit: null },
    ];
    const model = toFormatsViewProps({ formats });
    expect(model.rows[1].cells.slice(2)).toEqual([formatVolume(64 / 3968), "4 × can"]);
    expect(model.rows[2].cells[2]).toBe("—");
    expect(formats[1].bbl_per_unit).toBeNull();
  });
  it("maps list_formats plus components onto Basis / Volume / From", () => {
    const model = toFormatsViewProps(formatsInventory);
    expect(model.headers).toEqual(["Format", "Basis", "Volume", "From"]);
    expect(model.rows.map((r) => r.cells)).toEqual([
      ["16 oz can", "packaged", formatVolume("0.00403226"), "unit"],
      ["four-pack", "packaged", formatVolume("0.01612903"), "4 × can"],
      ["case · 24×16oz", "packaged", formatVolume("0.09677419"), "6 × four-pack"],
      ["½ bbl keg", "packaged", formatVolume("0.50000000"), "unit"],
      ["Hazy IPA · Pint", "poured", "16 oz", "Hazy IPA"],
    ]);
  });

  it("renders Add format and the five format names", () => {
    const html = htmlOf(createElement(FormatsView, { model: toFormatsViewProps(formatsInventory) }));
    expect(html).toMatch(/>Add format</);
    expect(html).toMatch(/16 oz can/);
    expect(html).toMatch(/four-pack/);
    expect(html).toMatch(/½ bbl keg/);
    expect(html).toMatch(/Pint/);
    expect(html).toContain(formatVolume("0.50000000"));
    expect(html).not.toMatch(/→|Open format/);
  });

  it("the Formats inventory record is FormatsView", () => {
    const body = screen("Formats").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(FormatsView);
    expect(body.props.model).toEqual(toFormatsViewProps(formatsInventory));
  });
});

describe("Format view", () => {
  it("maps a 16 oz can onto packaged chips, can, and 16 oz", () => {
    const model = toFormatViewProps(formatCan);
    expect(model.name).toBe("16 oz can");
    expect(model.basis).toBe("packaged");
    expect(model.packageType).toBe("can");
    expect(model.volumeValue).toBe("16");
    expect(model.volumeUnits[model.volumeUnitIndex]).toBe("oz");
    expect(model.bom.map((l) => [l.material, l.qty, l.onBreak])).toEqual([
      ["Can body", "1", "consumed"],
      ["Can end", "1", "consumed"],
    ]);
  });

  it("keeps basic fields prominent and materials in an optional section", () => {
    const html = htmlOf(createElement(FormatView, { model: toFormatViewProps(formatCan) }));
    expect(html).toMatch(/>Save format</);
    expect(html).toMatch(/Packaging materials · optional/);
    expect(html).toMatch(/Container/);
    expect(html).not.toMatch(/Basis|New SKU, then Pour,/);
    expect(html).toMatch(/Can body/);
    expect(html).not.toMatch(/→/);
  });

  it("the Format inventory record is FormatView through its fixture adapter", () => {
    const body = screen("Format").body as { type: unknown; props: { children: { type: unknown; props: { model: unknown } } } };
    expect(body.type).toBe(FormatFixture);
    expect(body.props.children.type).toBe(FormatView);
    expect(body.props.children.props.model).toEqual(toFormatViewProps(formatCan));
    expect(htmlOf(body as ReactNode)).toMatch(/>Save format</);
  });

  it("FormatView and CatalogCategoriesControl keep no fixture state", () => {
    for (const file of ["components/mgr/views/format.tsx", "components/mgr/views/catalog-categories.tsx"]) {
      expect(readFileSync(file, "utf8")).not.toMatch(/setLocal|localError|localComponents/);
    }
  });

  it("the live format form mounts the shared controlled FormatView", () => {
    const form = readFileSync("app/(app)/catalog/format-form.tsx", "utf8");
    expect(form).toMatch(/from "@\/components\/mgr\/views\/format"/);
    expect(form).toMatch(/<FormatView\b/);
    expect(form).toMatch(/controls=\{controls\}/);
    expect(form).not.toMatch(/<Label\b|<Input\b|<Select\b/);
  });
});

describe("Package BOM view", () => {
  it("maps replace_format_bom lines onto quantity rows", () => {
    const model = toPackageBomViewProps(packageBomCase);
    expect(model.format).toBe("case · 24×16 oz");
    expect(model.rows.map((r) => [r.title, r.detail])).toEqual([
      ["16 oz can", "quantity 24 · consumed"],
      ["Can end", "quantity 24 · consumed"],
      ["Case tray", "quantity 1 · return to stock"],
    ]);
  });

  it("renders Format, Replace BOM, and the three materials", () => {
    const html = htmlOf(createElement(PackageBomView, { model: toPackageBomViewProps(packageBomCase) }));
    expect(html).toMatch(/>Replace BOM</);
    expect(html).toMatch(/16 oz can/);
    expect(html).toMatch(/Can end/);
    expect(html).toMatch(/Case tray/);
    expect(html).toMatch(/case · 24×16 oz/);
    expect(html).not.toMatch(/→/);
  });

  it("footer null hides Replace BOM", () => {
    const html = htmlOf(createElement(PackageBomView, {
      model: toPackageBomViewProps(packageBomCase),
      footer: null,
    }));
    expect(html).not.toMatch(/>Replace BOM</);
    expect(html).toMatch(/Case tray/);
  });

  it("draws no row verb unless the caller passes one", () => {
    const model = toPackageBomViewProps(packageBomCase);
    expect(htmlOf(createElement(PackageBomView, { model }))).not.toMatch(/data-row-action/);
    expect(htmlOf(screen("Package BOM").body)).toMatch(/data-row-action[^>]*>Edit</);
    expect(readFileSync("app/(app)/catalog/formats/[id]/page.tsx", "utf8")).not.toMatch(/rowAction=/);
  });

  it("the Package BOM inventory record is PackageBomView", () => {
    const body = screen("Package BOM").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(PackageBomView);
    expect(body.props.model).toEqual(toPackageBomViewProps(packageBomCase));
  });

  it("the live format page mounts the shared PackageBomView", () => {
    const page = readFileSync("app/(app)/catalog/formats/[id]/page.tsx", "utf8");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/package-bom"/);
    expect(page).toMatch(/<PackageBomView\b/);
  });
});

describe('format editing clarity', () => {
  it('shows saved keg volume in barrels and leaves out case-only fields', () => {
    const model = toFormatViewProps({format:{id:'half',name:'Half keg',basis:'packaged',package_type:'keg',keg_size:'half_bbl',bbl_per_unit:'0.50000000'}});
    expect(model.volumeValue).toBe('0.5');
    expect(model.volumeUnits[model.volumeUnitIndex]).toBe('bbl');
    const html = htmlOf(createElement(FormatView,{model}));
    expect(html).toContain('Half keg');
    expect(html).not.toContain('Containers per case');
    expect(html).toContain('½ bbl');
    expect(html).not.toContain('aria-label="Volume"');
    expect(html).not.toContain('aria-label="Custom keg volume"');
  });
  it('does not offer direct volume editing on a format built from contents', () => {
    const model = toFormatViewProps({format:{id:'case',name:'Case',basis:'packaged',package_type:'can',bbl_per_unit:null,composed:true}});
    const html = htmlOf(createElement(FormatView,{model}));
    expect(html).toContain('Calculated from package contents');
    expect(html).not.toContain('aria-label="Volume"');
  });
  it('offers smaller packages and quantities before a composed format is saved', () => {
    const model = toFormatViewProps({format:{id:'new',name:'Case',basis:'packaged',package_type:'can',bbl_per_unit:null,composed:true}});
    const html = htmlOf(createElement(FormatView, { model, componentOptions: [{ id: 'can', name: '16 oz can' }] }));
    expect(html).toContain('Choose package');
    const selected = htmlOf(createElement(FormatView, { model, componentOptions: [{ id: 'can', name: '16 oz can' }], componentRows: [{ id: 'can', qty: '24' }] }));
    expect(selected).toContain('16 oz can');
    expect(html).toContain('Quantity 1');
    expect(html).not.toContain('Save this format, then add its contents');
  });
});
