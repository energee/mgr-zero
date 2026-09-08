// tests/channels-units-view.test.ts — Sale channels, Channel, and Units
// adapters plus view HTML. Views own no sample data.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { ChannelView } from "../components/mgr/views/channel";
import { SaleChannelsView } from "../components/mgr/views/sale-channels";
import { UnitsView } from "../components/mgr/views/units";
import { channelExport, saleChannelsList, unitsPlato } from "../lib/mgr/fixtures/settings-catalog";
import { formatGravity } from "../lib/mgr/gravity-unit";
import { toChannelViewProps } from "../lib/mgr/channel-view";
import { toSaleChannelsViewProps } from "../lib/mgr/sale-channels-view";
import { toUnitsViewProps } from "../lib/mgr/units-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("Sale channels view", () => {
  it("maps list_sale_channels through treatment labels and optional movements", () => {
    const model = toSaleChannelsViewProps(saleChannelsList);
    expect(model.backHref).toBe("/settings");
    expect(model.empty).toBeUndefined();
    expect(model.rows.map((r) => [r.title, r.detail])).toEqual([
      ["Wholesale", "taxable · 118 movements"],
      ["Taproom", "taxable · 402 movements"],
      ["DTC", "taxable · 34 movements"],
      ["Export", "export · 6 movements"],
    ]);
  });

  it("live-shaped rows omit movement counts and label snake_case treatments", () => {
    const model = toSaleChannelsViewProps({
      channels: [
        { id: "c1", name: "Taproom", tax_treatment: "taxable" },
        { id: "c2", name: "Bond", tax_treatment: "transfer_in_bond" },
      ],
    });
    expect(model.rows.map((r) => r.detail)).toEqual(["taxable", "transfer in bond"]);
  });

  it("names an empty list without inventing rows", () => {
    const model = toSaleChannelsViewProps({ channels: [] });
    expect(model.empty).toBe("No sale channels yet");
    expect(model.rows).toEqual([]);
  });

  it("renders Add channel and the inventory nav copy", () => {
    const html = htmlOf(createElement(SaleChannelsView, { model: toSaleChannelsViewProps(saleChannelsList) }));
    expect(html).toMatch(/>Add channel</);
    expect(html).toMatch(/Sale channels/);
    expect(html).toMatch(/Wholesale/);
    expect(html).toMatch(/taxable · 118 movements/);
    expect(html).toMatch(/Taproom/);
    expect(html).toMatch(/taxable · 402 movements/);
    expect(html).toMatch(/DTC/);
    expect(html).toMatch(/taxable · 34 movements/);
    expect(html).toMatch(/Export/);
    expect(html).toMatch(/export · 6 movements/);
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
    expect(body.props.model).toEqual(toSaleChannelsViewProps(saleChannelsList));
  });

  it("the live channels page mounts SaleChannelsView with no second E.* tree", () => {
    const src = readFileSync("app/(app)/settings/channels/page.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/sale-channels"/);
    expect(src).toMatch(/<SaleChannelsView\b/);
    expect(src).not.toMatch(/from "@\/components\/mgr\/e"/);
    expect(src).toMatch(/<ChannelForm\b/);
    expect(src).toMatch(/<DeleteChannelButton\b/);
  });
});

describe("Channel view", () => {
  it("maps Export onto chips index 1", () => {
    const model = toChannelViewProps(channelExport);
    expect(model.name).toBe("Export");
    expect(model.taxOptions).toEqual(["taxable", "export", "vessel supplies", "research", "transfer in bond"]);
    expect(model.taxIndex).toBe(1);
  });

  it("labels vessel_supplies at chips index 2", () => {
    const model = toChannelViewProps({
      id: "c-vs",
      name: "Lab",
      tax_treatment: "vessel_supplies",
    });
    expect(model.taxIndex).toBe(2);
    expect(model.taxOptions[2]).toBe("vessel supplies");
  });

  it("renders Channel name, export chips, override info, and Save channel", () => {
    const html = htmlOf(createElement(ChannelView, { model: toChannelViewProps(channelExport) }));
    expect(html).toMatch(/Channel name/);
    expect(html).toMatch(/value="Export"/);
    expect(html).toMatch(/>taxable</);
    expect(html).toMatch(/>export</);
    expect(html).toMatch(/>vessel supplies</);
    expect(html).toMatch(/>research</);
    expect(html).toMatch(/>transfer in bond</);
    expect(html).toMatch(/Customers may override this/);
    expect(html).toMatch(/A channel with movements cannot be deleted/);
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
  it("maps get_gravity_unit Plato default onto chip indices and formatGravity", () => {
    const model = toUnitsViewProps(unitsPlato);
    expect(model.backHref).toBe("/settings");
    expect(model.breweryOptions).toEqual(["Plato", "Specific gravity"]);
    expect(model.breweryIndex).toBe(0);
    expect(model.mineOptions).toEqual(["Use brewery default", "Plato", "Specific gravity"]);
    expect(model.mineIndex).toBe(0);
    expect(model.example).toBe(formatGravity(12.5, "plato"));
  });

  it("uses effective for the example when mine overrides brewery", () => {
    const model = toUnitsViewProps({ brewery: "plato", mine: "sg", effective: "sg" });
    expect(model.breweryIndex).toBe(0);
    expect(model.mineIndex).toBe(2);
    expect(model.example).toBe(formatGravity(12.5, "sg"));
  });

  it("renders back, stored-in-Plato info, chip groups, and the example", () => {
    const html = htmlOf(createElement(UnitsView, { model: toUnitsViewProps(unitsPlato) }));
    expect(html).toMatch(/Units/);
    expect(html).toMatch(/Gravity is always stored in °Plato/);
    expect(html).toMatch(/Brewery default/);
    expect(html).toMatch(/Your preference/);
    expect(html).toMatch(/Use brewery default/);
    expect(html).toMatch(/>Plato</);
    expect(html).toMatch(/Specific gravity/);
    expect(html).toMatch(/A 12.5 °P reading shows as/);
    expect(html).toContain(formatGravity(12.5, "plato"));
    expect(html).not.toMatch(/→/);
  });

  it("a controls slot replaces the chip groups and keeps the example", () => {
    const html = htmlOf(createElement(UnitsView, {
      model: toUnitsViewProps(unitsPlato),
      controls: "CONTROLS",
    }));
    expect(html).toMatch(/CONTROLS/);
    expect(html).not.toMatch(/Use brewery default/);
    expect(html).not.toMatch(/Brewery default/);
    expect(html).toMatch(/Gravity is always stored in °Plato/);
    expect(html).toMatch(/A 12.5 °P reading shows as/);
    expect(html).toContain(formatGravity(12.5, "plato"));
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
  });
});
