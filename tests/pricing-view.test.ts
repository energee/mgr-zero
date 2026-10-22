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
import { priceGroupReason, toPriceGroupViewProps } from "../lib/mgr/price-group-view";
import { cellCommit, toPriceGroupsViewProps } from "../lib/mgr/price-groups-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("Price groups view", () => {
  const [wholesale, taproom] = pricingGrid.channels;

  it("tabs every sale channel and tables the first by default", () => {
    const model = toPriceGroupsViewProps(pricingGrid);
    expect(model.tabs).toEqual(["Wholesale", "Taproom"]);
    expect(model.tab).toBe(0);
    expect(model.tabHrefs).toBeUndefined();
    // Every format is a column, as the live grid draws it: an unpriced format
    // still needs a cell to type in. null is unpriced; a cell is dollars text.
    expect(model.formats).toEqual(["½ bbl keg", "sixtel", "case · 24×16oz", "pint", "crowler"]);
    expect(model.channel?.name).toBe("Wholesale");
    expect(model.channel?.rows.map((r) => [r.name, ...r.cells])).toEqual([
      ["1", "132.00", "53.00", "46.00", null, null],
      ["2", "150.00", "95.00", "38.00", null, null],
      ["3", "240.00", "140.00", null, null, null],
    ]);
    expect(model.channel?.rows[1]?.id).toBe(pricingGrid.groups[1]?.id);
  });

  it("shows the channel the id names, links each tab, and falls back to the first for an unknown id", () => {
    const model = toPriceGroupsViewProps({ ...pricingGrid, channelId: taproom!.id, channelHref: (id) => `/pricing?channel=${id}` });
    expect(model.tab).toBe(1);
    expect(model.channel?.rows.map((r) => [r.name, ...r.cells])).toEqual([
      ["1", null, null, null, "7.00", "14.00"],
      ["2", null, null, null, "8.00", "16.00"],
      ["3", null, null, null, "11.00", null],
    ]);
    expect(model.tabHrefs).toEqual([["Wholesale", `/pricing?channel=${wholesale!.id}`], ["Taproom", `/pricing?channel=${taproom!.id}`]]);
    expect(toPriceGroupsViewProps({ ...pricingGrid, channelId: "gone" }).channel?.name).toBe("Wholesale");
  });

  it("collapses group-owned pours of the same name into one column", () => {
    const pg1 = pricingGrid.groups[0]!.id;
    const pg2 = pricingGrid.groups[1]!.id;
    const model = toPriceGroupsViewProps({
      ...pricingGrid,
      channelId: taproom!.id,
      formats: [
        { id: "half", name: "½ Keg", basis: "packaged" },
        { id: "p1", name: "14 oz pour", basis: "poured", price_group_id: pg1, ounces: 14 },
        { id: "p2", name: "14 oz pour", basis: "poured", price_group_id: pg2, ounces: 14 },
      ],
      cells: [
        { sale_channel_id: taproom!.id, price_group_id: pg1, format_id: "p1", unit_price_cents: 700 },
      ],
    });
    expect(model.formats).toEqual(["½ Keg", "14 oz pour"]);
    expect(model.channel?.rows[0]?.formatIds).toEqual(["half", "p1"]);
    expect(model.channel?.rows[0]?.cells[1]).toBe("7.00");
    expect(model.channel?.rows[1]?.formatIds).toEqual(["half", "p2"]);
    expect(model.channel?.rows[2]?.formatIds[1]).toBeNull();
  });

  it("labels a brand's format with its brand", () => {
    const model = toPriceGroupsViewProps({ ...pricingGrid, formats: [{ id: "f", name: "sixtel", brands: { name: "Hazy" } }] });
    expect(model.formats).toEqual(["Hazy · sixtel"]);
  });

  it("renders New price group, the channel tabs, group links, and one table of inline dollar fields", () => {
    const html = htmlOf(createElement(PriceGroupsView, { model: toPriceGroupsViewProps(pricingGrid) }));
    expect(html).toMatch(/>New price group</);
    expect(html).toMatch(/role="tablist"/);
    expect(html).toMatch(/>Wholesale</);
    expect(html).toMatch(/>Taproom</);
    expect(html.match(/<table\b/g)).toHaveLength(1);
    expect(html).toMatch(/data-to="Price group"/);
    expect(html).toContain('value="150.00"');
    expect(html).toContain('aria-label="2 · case · 24×16oz on Wholesale"');
    expect(html).toMatch(/placeholder="—"/);
    expect(html).not.toMatch(/not priced/);
  });

  it("offers to add a missing pour where a group has none of that column's name", () => {
    const pg1 = pricingGrid.groups[0]!.id;
    const html = htmlOf(createElement(PriceGroupsView, { model: toPriceGroupsViewProps({
      ...pricingGrid,
      formats: [{ id: "p1", name: "Half", basis: "poured", price_group_id: pg1, ounces: 9 }],
    }) }));
    expect(html.match(/\+ add/g)).toHaveLength(2);
    expect(html).toMatch(/Half pour to 2/);
    expect(html).toMatch(/Half pour to 3/);
  });

  it("createAction and the row slots replace the inventory button, links and cells inside the same table", () => {
    const html = htmlOf(createElement(PriceGroupsView, {
      model: toPriceGroupsViewProps({ ...pricingGrid, channelId: taproom!.id }),
      createAction: "CREATE",
      renderGroup: (row) => `G:${row.name}`,
      renderCell: (channel, row, col, value) => createElement("b", null, `${channel.name}/${row.name}/${col}/${value ?? "none"}`),
    }));
    expect(html).toMatch(/CREATE/);
    expect(html).not.toMatch(/New price group/);
    expect(html).toMatch(/G:2/);
    expect(html).not.toMatch(/data-to="Price group"/);
    expect(html).toContain("<b>Taproom/2/3/8.00</b>");
    expect(html).toContain("<b>Taproom/3/4/none</b>");
  });

  it("draws one blank state: no groups first, then no channels", () => {
    const none = htmlOf(createElement(PriceGroupsView, { model: toPriceGroupsViewProps({ ...pricingGrid, groups: [], channels: [] }) }));
    expect(none).toMatch(/Add a price group/);
    expect(none).not.toMatch(/No sale channels/);
    const noChannels = htmlOf(createElement(PriceGroupsView, { model: toPriceGroupsViewProps({ ...pricingGrid, channels: [] }) }));
    expect(noChannels).toMatch(/No sale channels yet/);
    expect(noChannels).not.toMatch(/role="tablist"/);
  });

  it("explains the grid once, above it, in one line", () => {
    const html = htmlOf(createElement(PriceGroupsView, { model: toPriceGroupsViewProps(pricingGrid) }));
    expect(html.match(/data-slot="alert"/g)?.length ?? 0).toBe(1);
    expect(html).toMatch(/the cell where they meet is the price/);
    expect(html).not.toMatch(/one table per sale channel/);
  });

  it("leaving a cell saves changed dollars, asks before clearing a priced cell, and refuses non-numbers", () => {
    expect(cellCommit("12.50", "12.50")).toEqual({ kind: "none" });
    expect(cellCommit("", "  ")).toEqual({ kind: "none" });
    expect(cellCommit("", "7")).toEqual({ kind: "save", cents: 700 });
    expect(cellCommit("7.00", "$8.25")).toEqual({ kind: "save", cents: 825 });
    expect(cellCommit("7.00", "0")).toEqual({ kind: "save", cents: 0 });
    expect(cellCommit("7.00", "7")).toEqual({ kind: "none" });
    expect(cellCommit("7.00", "")).toEqual({ kind: "clear" });
    expect(cellCommit("7.00", "abc")).toEqual({ kind: "invalid" });
    expect(cellCommit("7.00", "-1")).toEqual({ kind: "invalid" });
  });

  it("the live page fills the shared table's slots and reuses the group view for create", () => {
    const src = readFileSync("app/(app)/pricing/page.tsx", "utf8");
    expect(src).not.toMatch(/E\.tbl|E\.blank|E\.tabs|LinkTabs/);
    expect(src).toMatch(/renderGroup=/);
    expect(src).toMatch(/renderCell=/);
    expect(src).toMatch(/renderAddPour=\{\(row, pour\) => <PourForm priceGroupId=\{row\.id\} groupName=\{row\.name\} name=\{pour\} trigger=\{addPourTrigger\(pour, row\.name\)\}/);
    expect(src).toMatch(/channelHref: \(id\) => `\/pricing\?channel=\$\{id\}`/);
    expect(src).toMatch(/backHref="\/more"/);
    expect(src).toMatch(/createAction=\{<GroupForm model=\{toPriceGroupViewProps\(snapshot\)\}/);
    const form = readFileSync("app/(app)/pricing/group-form.tsx", "utf8");
    expect(form).not.toMatch(/<Input\b/);
    expect(form.match(/<PriceGroupView\b/g)?.length).toBe(1);
    expect(form).toMatch(/<PourForm key=\{`\$\{pour\.id\}/);
    const cell = readFileSync("app/(app)/pricing/price-cell-form.tsx", "utf8");
    expect(cell).toMatch(/<PriceCellInput\b/);
    expect(cell).toMatch(/cellCommit\(initial, dollars\)/);
    expect(cell).toMatch(/<ConfirmDeleteControl title="Clear price"/);
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
  const inputTag = (html: string, id: string) => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";

  it("Save price group names a missing group name instead of submitting (#1133)", () => {
    expect(priceGroupReason({ name: "" })).toBe("Still needed: a group name.");
    expect(priceGroupReason({ name: "  " })).toBe("Still needed: a group name.");
    expect(priceGroupReason({ name: "Core" })).toBeNull();
    const form = readFileSync("app/(app)/pricing/group-form.tsx", "utf8");
    expect(form).toMatch(/E\.submit\("Save price group", \{[^}]*reason: priceGroupReason\(draft\)/);
  });

  it("marks Group name required, says what Position does, and marks Cost ceiling optional (#1133)", () => {
    const html = htmlOf(createElement(PriceGroupView, { model: toPriceGroupViewProps(pricingGrid), footer: null }));
    expect(inputTag(html, "price-group-name")).toContain('required=""');
    expect(inputTag(html, "price-group-position")).toContain('aria-describedby="price-group-position-description"');
    expect(html).toMatch(/id="price-group-position-description"[^>]*>This group’s row in the price grid: 1 is the top row\./);
    expect(html).toContain("Cost ceiling ($/bbl) (optional)");
    expect(inputTag(html, "price-group-ceiling")).not.toContain("required");
    expect(html).toMatch(/id="price-group-ceiling-description"[^>]*>Dollars per barrel of recipe cost\./);
    expect(html).not.toContain("never moved");
  });

  it("maps group 2's ceiling, previous none, and the Hazy featured cell", () => {
    const model = toPriceGroupViewProps(priceGroupTwo);
    expect(model.name).toBe("2");
    expect(model.position).toBe("2");
    expect(model.costCeiling).toBe(money(6500));
    expect(model.previousCeilingLabel).toBe("Cost ceiling · group 1");
    expect(model.previousCeiling).toBe("none");
    expect(model.prices).toBe(`${money(15000)} on Wholesale · ½ bbl keg, and 4 more cells`);
    expect(model.removeDetail).toMatch(/refused/);
  });

  it("lists one barcode row per packaged format, an empty one reading none (spec D4)", () => {
    const model = toPriceGroupViewProps(priceGroupTwo);
    // The fixture's formats carry no basis, so all five read as packaged, as the grid draws them.
    expect(model.barcodes?.map((b) => [b.format, b.upc])).toEqual([
      ["½ bbl keg", ""], ["sixtel", ""], ["case · 24×16oz", "00810123450127"], ["pint", ""], ["crowler", ""],
    ]);
    // A pour never scans.
    const pour = { id: "pour-1", name: "Glass", basis: "poured" as const, price_group_id: priceGroupTwo.groupId };
    expect(toPriceGroupViewProps({ ...priceGroupTwo, formats: [...priceGroupTwo.formats, pour] }).barcodes?.map((b) => b.format)).not.toContain("Glass");
    const html = htmlOf(createElement(PriceGroupView, { model }));
    expect(html).toMatch(/UPC · case · 24×16oz/);
    expect(html).toMatch(/00810123450127/);
    // The create form has no group yet, so no barcode rows.
    expect(toPriceGroupViewProps({ ...priceGroupTwo, groupId: undefined }).barcodes).toBeUndefined();
  });

  it("keys each pour row so a group with two pours does not warn", () => {
    const src = readFileSync("components/mgr/views/price-group.tsx", "utf8");
    expect(src).toMatch(/<Fragment key=\{pour\.id\}>/);
    const html = htmlOf(createElement(PriceGroupView, {
      model: { ...toPriceGroupViewProps(priceGroupTwo), pours: [{ id: "p1", name: "14 oz pour", ounces: "14" }, { id: "p2", name: "taster", ounces: "5" }] },
    }));
    expect(html).toMatch(/14 oz pour/);
    expect(html).toMatch(/taster/);
    // Two pour Removes; the group itself is Delete (#760: each opens a confirm sheet).
    expect(html.match(/>Remove</g)?.length).toBe(2);
    expect(html).toMatch(/>Delete</);
  });

  it("renders the inventory edits, Prices line, and refused Remove", () => {
    const html = htmlOf(createElement(PriceGroupView, { model: toPriceGroupViewProps(priceGroupTwo) }));
    expect(html).toMatch(/Group name/);
    expect(html).toMatch(/Position/);
    expect(html).toMatch(/Cost ceiling/);
    expect(html).toContain(money(6500));
    expect(html).toMatch(/Cost ceiling · group 1/);
    expect(html).toMatch(/none/);
    expect(html).toContain(`${money(15000)} on Wholesale · ½ bbl keg, and 4 more cells`);
    expect(html).toMatch(/>Delete</);
    expect(html).toMatch(/refused while a brand sits on it/);
    expect(html).not.toMatch(/→/);
  });

  it("a new group starts blank at the next position, under the last ceiling, with no Prices line", () => {
    const model = toPriceGroupViewProps(pricingGrid);
    expect(model.name).toBe("");
    expect(model.position).toBe("4");
    expect(model.costCeilingInput).toBe("");
    expect(model.previousCeilingLabel).toBe("Cost ceiling · group 3");
    expect(model.previousCeiling).toBe("none");
    expect(model.prices).toBeUndefined();
    expect(model.removeDetail).toBeUndefined();
    const html = htmlOf(createElement(PriceGroupView, { model, footer: null }));
    expect(html).not.toMatch(/Prices/);
    expect(html).not.toMatch(/Remove/);
  });

  it("a new group starts past the highest position when a middle group was removed (#423)", () => {
    // Positions 1 and 3 remain; count + 1 would be 3, which collides with
    // unique (brewery_id, position).
    const groups = pricingGrid.groups.filter((g) => g.position !== 2);
    expect(toPriceGroupViewProps({ ...pricingGrid, groups }).position).toBe("4");
  });

  it("keeps the ceiling note to one sentence", () => {
    const html = htmlOf(createElement(PriceGroupView, { model: toPriceGroupViewProps(priceGroupTwo) }));
    const note = html.match(/<div data-slot="alert-description"[^>]*>(.*?)<\/div>/)?.[1] ?? "";
    expect(note.split(/\. /).length).toBeLessThanOrEqual(2);
  });

  it("the Price group inventory record is PriceGroupView", () => {
    const body = screen("Price group").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(PriceGroupView);
    expect(body.props.model).toEqual(toPriceGroupViewProps(priceGroupTwo));
  });
});

it("bounds Position as the command does: a required whole number from 1 (#447)", () => {
  const html = htmlOf(createElement(PriceGroupView, { model: toPriceGroupViewProps(pricingGrid), controls: { position: () => undefined }, back: null }));
  const position = /<input[^>]*aria-label="Position"[^>]*>/.exec(html)?.[0] ?? "";
  expect(position).toContain('min="1"');
  expect(position).toContain('step="1"');
  expect(position).toContain("required");
});
