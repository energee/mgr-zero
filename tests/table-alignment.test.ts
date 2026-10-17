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
import { formatsInventory } from "@/lib/mgr/fixtures/catalog";
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

  it("leaves unspecified columns left when alignment is partial", () => {
    expectAlignment(renderToStaticMarkup(E.tbl(["Qty", "Record", "State"], [["0", "Missing amount", "Unknown"]], ["r"])), ["r", "l", "l"]);
  });

  it.each([
    ["Formats", ["l", "l", "r", "l", "l"]],
    ["Import", ["r", "l", "l", "l"]],
  ] as const)("renders %s inventory through the shared view with semantic alignment", (name, alignment) => {
    const screen = SCREENS.find(screen => screen.name === name)!;
    expectAlignment(renderToStaticMarkup(createElement("div", null, screen.body)), [...alignment]);
  });

  it("keeps every format value and action in labeled phone cards and desktop columns", () => {
    const model = toFormatsViewProps({ ...formatsInventory, formatHref: row => `/catalog/formats/${row.id}` });
    const html = renderToStaticMarkup(createElement(FormatsView, { model }));
    const cards = html.match(/<li\b[\s\S]*?<\/li>/g) ?? [];
    expect(cards.length).toBe(model.rows.length);
    expect(cells(html, "td").length).toBe(model.rows.length * 5);
    cards.forEach((card, index) => {
      const row = model.rows[index];
      for (const value of row.cells) expect(card).toContain(value);
      expect([...card.matchAll(/<dt\b[^>]*>(.*?)<\/dt>/g)].map(match => match[1])).toEqual(model.headers.slice(1));
      expect(card).toContain(`href="${row.href}"`);
      expect(card).toContain("Open format");
    });
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

  it("keeps every channel, format and group in the scrollable price matrix", () => {
    const model = toPriceGroupsViewProps(pricingGrid);
    const html = renderToStaticMarkup(createElement(PriceGroupsView, { model }));
    expectAlignment(html, ["l", ...model.formats.map(() => "r" as const)]);
    expect((html.match(/<table\b/g) ?? []).length).toBe(model.channels.length);
    expect(cells(html, "th").length).toBe(model.channels.length * (model.formats.length + 1));
    expect(cells(html, "td").length).toBe(model.channels.reduce((total, channel) => total + channel.rows.length * (model.formats.length + 1), 0));
    expect(html).toContain("overflow-x-auto");
    for (const channel of model.channels) {
      expect(html).toContain(channel.name);
      for (const row of channel.rows) for (const value of row.cells) if (value !== null) expect(html).toContain(value);
    }
  });
});
