// Gates semantic table alignment and the shared Formats / Import drawings (#909 S1).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { E } from "@/components/mgr/e";
import { SCREENS } from "@/components/mgr/screens";
import { PriceGroupsView } from "@/components/mgr/views/price-groups";
import { pricingGrid } from "@/lib/mgr/fixtures/pricing";
import { toPriceGroupsViewProps } from "@/lib/mgr/price-groups-view";
import { ImportView } from "@/components/mgr/views/import";
import { importPreview } from "@/lib/mgr/fixtures/import";
import { FormatsView } from "@/components/mgr/views/formats";
import { CatalogView } from "@/components/mgr/views/catalog";
import { catalogBrands, formatsInventory } from "@/lib/mgr/fixtures/catalog";
import { toCatalogViewProps } from "@/lib/mgr/catalog-view";
import { toFormatsViewProps } from "@/lib/mgr/formats-view";

function cells(html: string, tag: "th" | "td") {
  return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*class="([^"]*)"[^>]*>([\\s\\S]*?)</${tag}>`, "g"))]
    .map(match => ({ alignment: match[1].split(" ").filter(value => value === "text-left" || value === "text-right"), content: match[2].replace(/<[^>]*>/g, "") }));
}

function expectAlignment(html: string, alignment: ("l" | "r")[]) {
  for (const tag of ["th", "td"] as const) {
    const rendered = cells(html, tag);
    expect(rendered.length).toBeGreaterThan(0);
    rendered.forEach((cell, index) => expect(cell.alignment, `${tag}: ${cell.content}`).toEqual([alignment[index % alignment.length] === "r" ? "text-right" : "text-left"]));
  }
}

describe("E.tbl column alignment", () => {
  it("defaults every text column to left and retains real table sections", () => {
    const html = renderToStaticMarkup(E.tbl(["Record", "Match", "State"], [["Long customer name", "Exact match", "Ready"]]));
    expectAlignment(html, ["l", "l", "l"]);
    for (const tag of ["table", "thead", "tbody", "tr", "th", "td"]) expect(html).toMatch(new RegExp(`<${tag}\\b`));
    expect(cells(html, "td").map(cell => cell.content)).toEqual(["Long customer name", "Exact match", "Ready"]);
  });

  it("aligns quantities and amounts right, including a numeric first column", () => {
    const html = renderToStaticMarkup(E.tbl(["Row", "Item", "Qty", "Amount", "State"], [["1", "Hazy IPA", "1,234.5", "−$25.00", "Review"], ["2", "Pils", "0", "—", "Ready"]], ["r", "l", "r", "r", "l"]));
    expectAlignment(html, ["r", "l", "r", "r", "l"]);
    expect(cells(html, "td").map(cell => cell.content)).toContain("−$25.00");
  });

  it("draws each header as a sort button without changing its alignment", () => {
    const html = renderToStaticMarkup(E.tbl(["Item", "Qty"], [["Hazy IPA", "1,234.5"], ["Pils", "0"]], ["l", "r"]));
    expectAlignment(html, ["l", "r"]);
    const heads = [...html.matchAll(/<th\b[^>]*>[\s\S]*?<\/th>/g)].map(match => match[0]);
    for (const head of heads) {
      expect(head).toContain('aria-sort="none"');
      expect(head).toMatch(/<button\b/);
    }
    expect(cells(html, "td").map(cell => cell.content)).toEqual(["Hazy IPA", "1,234.5", "Pils", "0"]);
    expect(html).toContain("shrink-0");
    expect(html).toContain("min-w-max");
  });

  it("draws plain header text when the table is not sortable", () => {
    const html = renderToStaticMarkup(E.tbl(["Item", "Qty"], [["Hazy IPA", "1"]], ["l", "r"], { sortable: false }));
    expectAlignment(html, ["l", "r"]);
    expect(html).not.toContain("aria-sort");
    expect(html).not.toMatch(/<button\b/);
    expect(cells(html, "th").map(cell => cell.content)).toEqual(["Item", "Qty"]);
  });

  it("leaves unspecified columns left when alignment is partial", () => {
    expectAlignment(renderToStaticMarkup(E.tbl(["Qty", "Record", "State"], [["0", "Missing amount", "Unknown"]], ["r"])), ["r", "l", "l"]);
  });

  it.each([
    ["Formats", ["l", "l", "r", "l"]],
    ["Import", ["r", "l", "l", "l"]],
  ] as const)("renders %s inventory through the shared view with semantic alignment", (name, alignment) => {
    const screen = SCREENS.find(screen => screen.name === name)!;
    expectAlignment(renderToStaticMarkup(createElement("div", null, screen.body)), [...alignment]);
  });

  it("keeps every format value in labeled phone records and desktop columns, the name linking the format", () => {
    const model = toFormatsViewProps({ ...formatsInventory, formatHref: row => `/catalog/formats/${row.id}` });
    const html = renderToStaticMarkup(createElement(FormatsView, { model }));
    const records = html.split(/data-slot="item"(?=[\s>])/).slice(1);
    expect(records.length).toBe(model.rows.length);
    expect(cells(html, "td").length).toBe(model.rows.length * 4);
    expect(cells(html, "td").filter((_, index) => index % 4 === 0).map(cell => cell.content)).toEqual(model.rows.map(row => row.cells[0]));
    expect(html).not.toContain("Open format");
    records.forEach((record, index) => {
      const row = model.rows[index];
      for (const value of row.cells) expect(record).toContain(value);
      expect([...record.matchAll(/<dt\b[^>]*>(.*?)<\/dt>/g)].map(match => match[1])).toEqual(model.headers.slice(1));
      expect(record).toMatch(new RegExp(`<a\\b[^>]*href="${row.href}"[^>]*>${row.cells[0]}</a>`));
    });
  });

  it("renders the Catalog brand table with text and COLA left and counts right", () => {
    const html = renderToStaticMarkup(createElement(CatalogView, { model: toCatalogViewProps(catalogBrands) }));
    expectAlignment(html, ["l", "l", "r", "r", "l"]);
  });

  it("keeps import results and original preview row numbers with text results left", () => {
    const html = renderToStaticMarkup(createElement(ImportView, { model: {
      ...importPreview, step: 3, previewRows: [2, 4],
      result: { committed: 1, blocked: 1, outcomes: [
        { row: 1, status: "committed", result: { id: "saved-record" } },
        { row: 2, status: "blocked", error: "Name already exists" },
      ] },
    } }));
    expectAlignment(html, ["r", "l"]);
    expect(cells(html, "td").map(cell => cell.content)).toEqual(["2", "committed · saved-record", "4", "blocked: Name already exists"]);
  });

  it("keeps every format and group of the showing channel in the scrollable price matrix", () => {
    const model = toPriceGroupsViewProps(pricingGrid);
    const html = renderToStaticMarkup(createElement(PriceGroupsView, { model }));
    expectAlignment(html, ["l", ...model.formats.map(() => "r" as const)]);
    expect((html.match(/<table\b/g) ?? []).length).toBe(1);
    expect(cells(html, "th").length).toBe(model.formats.length + 1);
    expect(cells(html, "td").length).toBe(model.channel!.rows.length * (model.formats.length + 1));
    expect(html).toContain("overflow-x-auto");
    for (const row of model.channel!.rows) for (const value of row.cells) if (value !== null) expect(html).toContain(`value="${value}"`);
  });
});

/** A screen's rendered headers: each one's text and whether it is a sort button. */
function sortHeads(name: string) {
  const html = renderToStaticMarkup(createElement("div", null, SCREENS.find(screen => screen.name === name)!.body));
  return [...html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(match => ({ text: match[1].replace(/<[^>]*>/g, ""), sorts: /<button\b/.test(match[1]) }));
}

describe("screen table sorting", () => {
  it.each([
    ["Finished goods", "Available"],
    ["Orders", "Status"],
    ["Batches", "Vessel and latest reading"],
  ])("%s sorts its %s column by an explicit value, since the cell is a component", (name, header) => {
    expect(sortHeads(name).filter(head => head.text === header).map(head => head.sorts)).toContain(true);
  });

  it.each(["Monthly compliance", "Price groups"])("%s keeps its saved row order: no header sorts", name => {
    const heads = sortHeads(name);
    expect(heads.length).toBeGreaterThan(0);
    expect(heads.filter(head => head.sorts)).toEqual([]);
  });
});
