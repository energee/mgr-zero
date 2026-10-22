// tests/channels-units-view.test.ts — Sale channels, Channel, and Units
// adapters plus view HTML. Views own no sample data.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { ChannelView } from "../components/mgr/views/channel";
import { DeleteChannelControl } from "../components/mgr/views/delete-channel";
import { SaleChannelsView } from "../components/mgr/views/sale-channels";
import { GravityUnitControls, UnitsView } from "../components/mgr/views/units";
import { channelExport, saleChannelsList, unitsPlato } from "../lib/mgr/fixtures/settings-catalog";
import { toChannelViewProps } from "../lib/mgr/channel-view";
import { CHANNEL_IN_USE_RULE, toSaleChannelsViewProps } from "../lib/mgr/sale-channels-view";
import { toUnitsViewProps } from "../lib/mgr/units-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("Sale channels view", () => {
  it("maps list_sale_channels through treatment labels and optional movements", () => {
    const model = toSaleChannelsViewProps(saleChannelsList);
    expect(model.backHref).toBeUndefined();
    expect(model.empty).toBeUndefined();
    expect(model.rows.map((r) => [r.title, r.detail])).toEqual([
      ["Wholesale", "Taxable · 118 movements"],
      ["Taproom", "Taxable · 402 movements"],
      ["DTC", "Taxable · 34 movements"],
      ["Export", "Export · 6 movements"],
    ]);
  });

  it("live-shaped rows omit movement counts and label snake_case treatments", () => {
    const model = toSaleChannelsViewProps({
      channels: [
        { id: "c1", name: "Taproom", tax_treatment: "taxable" },
        { id: "c2", name: "Bond", tax_treatment: "transfer_in_bond" },
      ],
    });
    expect(model.rows.map((r) => r.detail)).toEqual(["Taxable", "Transfer in bond"]);
  });

  it("states the in-use rule only for a role that may delete (#1149)", () => {
    expect(toSaleChannelsViewProps({ ...saleChannelsList, canDelete: true }).deleteNote).toBe(CHANNEL_IN_USE_RULE);
    expect(toSaleChannelsViewProps(saleChannelsList).deleteNote).toBeUndefined();
    // An empty list offers no Delete, so it states no rule.
    expect(toSaleChannelsViewProps({ channels: [], canDelete: true }).deleteNote).toBeUndefined();
  });

  it("the staff guide quotes the in-use rule the screen states", () => {
    expect(readFileSync("content/docs/staff-guide.mdx", "utf8")).toContain(CHANNEL_IN_USE_RULE);
  });

  it("draws the in-use rule on the list where Delete is offered", () => {
    const withRule = htmlOf(createElement(SaleChannelsView, { model: toSaleChannelsViewProps({ ...saleChannelsList, canDelete: true }) }));
    expect(withRule).toContain(CHANNEL_IN_USE_RULE);
    expect(htmlOf(createElement(SaleChannelsView, { model: toSaleChannelsViewProps(saleChannelsList) }))).not.toContain("cannot be deleted");
  });

  it("the delete confirm states the same rule", () => {
    expect(DeleteChannelControl({ name: "Export" }).props.warning).toBe(CHANNEL_IN_USE_RULE);
  });

  it("names an empty list without inventing rows", () => {
    const model = toSaleChannelsViewProps({ channels: [] });
    expect(model.empty?.title).toBe("No sale channels yet");
    expect(model.rows).toEqual([]);
  });

  it("renders Add channel and the inventory nav copy", () => {
    const html = htmlOf(createElement(SaleChannelsView, { model: toSaleChannelsViewProps(saleChannelsList) }));
    expect(html).toMatch(/>Add channel</);
    expect(html).toMatch(/Sale channels/);
    expect(html).toMatch(/Wholesale/);
    expect(html).toMatch(/Taxable · 118 movements/);
    expect(html).toMatch(/Taproom/);
    expect(html).toMatch(/Taxable · 402 movements/);
    expect(html).toMatch(/DTC/);
    expect(html).toMatch(/Taxable · 34 movements/);
    expect(html).toMatch(/Export/);
    expect(html).toMatch(/Export · 6 movements/);
    expect(html).toMatch(/aria-label="Open"/);
    expect(html).not.toMatch(/No sale channels yet/);
    expect(html).not.toMatch(/never restates a filed month/);
    expect(html).not.toMatch(/→/);
  });

  it("createAction, info, and rowTrailing replace inventory Add / nav", () => {
    const model = toSaleChannelsViewProps(saleChannelsList);
    const html = htmlOf(createElement(SaleChannelsView, {
      model,
      createAction: "ADD",
      info: "LIVE INFO",
      rowTrailing: (id) => `T-${id}`,
    }));
    expect(html).toMatch(/ADD/);
    expect(html).not.toMatch(/>Add channel</);
    expect(html).toMatch(/LIVE INFO/);
    expect(html).toMatch(`T-${model.rows[0]!.key}`);
    expect(html).not.toMatch(/aria-label="Open"/);
    expect(html).toMatch(/Wholesale/);
  });

  it("blank-states an empty model", () => {
    const html = htmlOf(createElement(SaleChannelsView, { model: toSaleChannelsViewProps({ channels: [] }) }));
    expect(html).toMatch(/No sale channels yet/);
    expect(html).toMatch(/>Add channel</);
    expect(html).not.toMatch(/Wholesale/);
  });

  it("the Sale channels inventory record is SaleChannelsView", () => {
    const body = screen("Sale channels").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Sale channels").body)).toBe(true);
    expect(body.type).toBe(SaleChannelsView);
    // Drawn as Admin, the persona its permission state names, so it states the rule.
    expect(body.props.model).toEqual(toSaleChannelsViewProps({ ...saleChannelsList, canDelete: true }));
  });

  it("the live channels page mounts SaleChannelsView with no second E.* tree", () => {
    const src = readFileSync("app/(app)/settings/channels/page.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/sale-channels"/);
    expect(src).toMatch(/<SaleChannelsView\b/);
    expect(src).not.toMatch(/from "@\/components\/mgr\/e"/);
    expect(src).toMatch(/<ChannelForm\b/);
    expect(src).toMatch(/control=\{DeleteChannelControl\} command="delete_sale_channel"/);
    expect(src).toContain('backHref: toSettings ? "/settings" : "/more"');
    // Add/Edit/Delete are drawn only for a role the registry lets run them (#478).
    expect(src).toContain('canRun(ctx, "upsert_sale_channel")');
    expect(src).toContain('canRun(ctx, "delete_sale_channel")');
    expect(src).toContain("toSaleChannelsViewProps({ channels, canDelete, backHref");
  });
});

describe("Channel view", () => {
  it("the live channel form mounts ChannelView", () => {
    const source = readFileSync("app/(app)/settings/channels/channel-form.tsx", "utf8");
    expect(source).toMatch(/<ChannelView\b/);
    // Add and Edit are told apart, and Edit names the saved channel (#1149).
    expect(source).toContain('title={isEdit ? `Edit channel · ${channel.name}` : "Add channel"}');
    expect(source).not.toMatch(/components\/ui\/(input|label|select)/);
  });

  it("maps Export onto chips index 1", () => {
    const model = toChannelViewProps(channelExport);
    expect(model.name).toBe("Export");
    expect(model.taxOptions).toEqual(["Taxable", "Export", "Vessel supplies", "Research", "Transfer in bond"]);
    expect(model.taxIndex).toBe(1);
    expect(model.taxHint).toBe("Sold for shipment outside the US, not taxed.");
  });

  it("labels vessel_supplies at chips index 2", () => {
    const model = toChannelViewProps({
      id: "c-vs",
      name: "Lab",
      tax_treatment: "vessel_supplies",
    });
    expect(model.taxIndex).toBe(2);
    expect(model.taxOptions[2]).toBe("Vessel supplies");
    // Only Export has settled hint copy (#1149); the rest stay unhinted.
    expect(model.taxHint).toBeUndefined();
  });

  it("renders Channel name, labelled export chips with their hint, override info, and Save channel", () => {
    const html = htmlOf(createElement(ChannelView, { model: toChannelViewProps(channelExport) }));
    expect(html).toMatch(/Channel name/);
    expect(html).toMatch(/>Tax treatment</);
    // The hint changes with the selection, so it sits in a status region.
    expect(html).toMatch(/<div role="status"><p[^>]*>Sold for shipment outside the US, not taxed\.<\/p><\/div>/);
    expect(html).toMatch(/value="Export"/);
    expect(html).toMatch(/>Taxable</);
    expect(html).toMatch(/>Export</);
    expect(html).toMatch(/>Vessel supplies</);
    expect(html).toMatch(/>Research</);
    expect(html).toMatch(/>Transfer in bond</);
    expect(html).toMatch(/Customers may override this/);
    // The sheet has no Delete, so it states no delete rule (#1149).
    expect(html).not.toMatch(/cannot be deleted/);
    expect(html).toMatch(/>Save channel</);
    expect(html).not.toMatch(/→/);
  });

  it("the Channel inventory record is ChannelView", () => {
    const body = screen("Channel").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(ChannelView);
    expect(body.props.model).toEqual(toChannelViewProps(channelExport));
  });
});

describe("Units view", () => {
  it("maps get_gravity_unit Plato default onto chip indices with one label per unit (#1155)", () => {
    const model = toUnitsViewProps(unitsPlato);
    expect(model.backHref).toBeUndefined();
    expect(model.breweryOptions).toEqual(["Plato (°P)", "Specific gravity (SG)"]);
    expect(model.breweryIndex).toBe(0);
    expect(model.mineOptions).toEqual(["Use brewery default · Plato (°P)", "Plato (°P)", "Specific gravity (SG)"]);
    expect(model.mineIndex).toBe(0);
  });

  it("previews a reading typed in the other unit, converted into the unit in effect (#1155)", () => {
    // 1.050 SG is 12.39 °P, so Plato shows 12.4 — computed, not the 12.5 sample echoed.
    expect(toUnitsViewProps(unitsPlato).preview).toBe("A reading of 1.050 SG shows as 12.4 °P.");
    expect(toUnitsViewProps({ brewery: "plato", mine: "sg", effective: "sg" }).preview)
      .toBe("A reading of 12.5 °P shows as 1.050 SG.");
  });

  it("explains who each gravity choice affects, in inventory and live alike (#671 review)", () => {
    const html = htmlOf(createElement(UnitsView, { model: toUnitsViewProps(unitsPlato) }));
    expect(html).toContain("What everyone here sees unless they choose otherwise below.");
    expect(html).toContain("Yours alone; it changes nothing for anyone else.");
    expect(html).toContain("Use brewery default · Plato (°P)");
  });

  it("places the chips on brewery and mine when mine overrides brewery", () => {
    const model = toUnitsViewProps({ brewery: "plato", mine: "sg", effective: "sg" });
    expect(model.breweryIndex).toBe(0);
    expect(model.mineIndex).toBe(2);
  });

  it("renders back, the gravity section, the display-only note, chip groups, and the preview", () => {
    const html = htmlOf(createElement(UnitsView, { model: toUnitsViewProps(unitsPlato) }));
    expect(html).toMatch(/Units/);
    expect(html).toMatch(/>Gravity unit</);
    expect(html).toContain("Changing this only changes how gravity is shown and typed. Your readings are not changed.");
    expect(html).not.toMatch(/stored/i);
    expect(html).toMatch(/Brewery default/);
    expect(html).toMatch(/Your preference/);
    expect(html).toMatch(/>Plato \(°P\)</);
    expect(html).toMatch(/>Specific gravity \(SG\)</);
    expect(html).toContain("A reading of 1.050 SG shows as 12.4 °P.");
    expect(html).not.toMatch(/→/);
  });

  it("a controls slot replaces the chip groups and the preview, and keeps the note", () => {
    const html = htmlOf(createElement(UnitsView, {
      model: toUnitsViewProps(unitsPlato),
      controls: "CONTROLS",
    }));
    expect(html).toMatch(/CONTROLS/);
    expect(html).not.toMatch(/Use brewery default/);
    expect(html).not.toMatch(/Brewery default/);
    expect(html).toContain("Changing this only changes how gravity is shown and typed. Your readings are not changed.");
    expect(html).not.toMatch(/A reading of/);
  });

  it("the preview follows the controls' model, so a tapped chip and the preview agree (#1155 review)", () => {
    const html = htmlOf(createElement(GravityUnitControls, {
      model: toUnitsViewProps({ brewery: "plato", mine: "sg", effective: "sg" }),
    }));
    expect(html).toContain("A reading of 12.5 °P shows as 1.050 SG.");
  });

  it("the Units inventory record is UnitsView", () => {
    const body = screen("Units").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(UnitsView);
    expect(body.props.model).toEqual(toUnitsViewProps(unitsPlato));
  });

  it("the live Units page mounts UnitsView with GravityUnitForm as controls", () => {
    const src = readFileSync("app/(app)/settings/units/page.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/units"/);
    expect(src).toMatch(/<UnitsView\b/);
    expect(src).not.toMatch(/from "@\/components\/mgr\/e"/);
    expect(src).toMatch(/<GravityUnitForm\b/);
    expect(src).toContain('backHref: toSettings ? "/settings" : "/more"');
  });
});

it("puts a gravity choice back on the stored unit when its save fails (#447)", () => {
  const src = readFileSync(new URL("../app/(app)/settings/units/gravity-unit-form.tsx", import.meta.url), "utf8");
  expect(src).toContain('run("set_brewery_gravity_unit", { unit }).then(ok => { if (!ok) setBreweryChoice(brewery); })');
  expect(src).toContain('run("set_my_gravity_unit", { unit }).then(ok => { if (!ok) setMineChoice(mine); })');
});

it("shares Units controls between fixture and live adapters", () => {
  expect(readFileSync("components/mgr/views/units.tsx", "utf8")).toContain("<GravityUnitControls");
  expect(readFileSync("app/(app)/settings/units/gravity-unit-form.tsx", "utf8")).toContain("<GravityUnitControls");
});
