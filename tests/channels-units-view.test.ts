// tests/channels-units-view.test.ts — Sale channels, Channel, and gravity
// unit adapters plus view HTML. Views own no sample data. The gravity unit has
// no page of its own: the brewery default sits under Brewery details in
// Settings and the personal choice in the Me sheet (#1509 item 7, #1513).
import { existsSync, readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { ChannelView } from "../components/mgr/views/channel";
import { DeleteChannelControl } from "../components/mgr/views/delete-channel";
import { SaleChannelsView } from "../components/mgr/views/sale-channels";
import { GravityUnitControls } from "../components/mgr/views/units";
import { MeView } from "../components/mgr/views/me";
import { SettingsView } from "../components/mgr/views/settings";
import { meMaria } from "../lib/mgr/fixtures/me";
import { settingsDemo } from "../lib/mgr/fixtures/settings";
import { channelExport, saleChannelsList, unitsPlato } from "../lib/mgr/fixtures/settings-catalog";
import { toChannelViewProps } from "../lib/mgr/channel-view";
import { CHANNEL_IN_USE_RULE, toSaleChannelsViewProps } from "../lib/mgr/sale-channels-view";
import { toUnitsViewProps } from "../lib/mgr/units-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("Sale channels view", () => {
  it("preserves channel identity and optional movement counts", () => {
    const model = toSaleChannelsViewProps(saleChannelsList);
    expect(model.backHref).toBeUndefined();
    expect(model.empty).toBeUndefined();
    expect(model.rows.map((r) => [r.key, r.title])).toEqual(
      saleChannelsList.channels.map((channel) => [channel.id, channel.name]),
    );
    saleChannelsList.channels.forEach((channel, index) => {
      expect(model.rows[index].detail).toContain(String(channel.movements));
    });
  });

  it("live-shaped rows omit movement counts and label snake_case treatments", () => {
    const model = toSaleChannelsViewProps({
      channels: [
        { id: "c1", name: "Taproom", tax_treatment: "taxable", in_use: true, system_code: "taproom" },
        { id: "c2", name: "Bond", tax_treatment: "transfer_in_bond", in_use: false, system_code: null },
      ],
    });
    expect(model.rows[0].detail).toContain("Taxable");
    expect(model.rows[1].detail).toContain("Transfer in bond");
    expect(model.rows.every((row) => !/\d/.test(row.detail))).toBe(true);
  });

  it("distinguishes an Export channel name from its treatment on the live list (#1149)", () => {
    const model = toSaleChannelsViewProps({
      channels: [{ id: "c-export", name: "Export", tax_treatment: "export", in_use: false, system_code: null }],
    });
    const row = model.rows[0];
    expect(row.title).toBe("Export");
    expect(row.detail).toContain(row.title);
    expect(row.detail).not.toBe(row.title);
  });

  // #1207: Delete shows only where delete_sale_channel would succeed.
  const mixed = {
    channels: [
      { id: "c1", name: "Taproom", tax_treatment: "taxable", in_use: false, system_code: "taproom" },
      { id: "c2", name: "Wholesale", tax_treatment: "taxable", in_use: true, system_code: null },
      { id: "c3", name: "Festival", tax_treatment: "taxable", in_use: false, system_code: null },
    ],
  };

  it("offers Delete only on an unused channel that is not the system Taproom (#1207)", () => {
    expect(toSaleChannelsViewProps({ ...mixed, canDelete: true }).rows.map((r) => [r.title, r.deletable]))
      .toEqual([["Taproom", false], ["Wholesale", false], ["Festival", true]]);
    expect(toSaleChannelsViewProps(mixed).rows.map((r) => r.deletable)).toEqual([false, false, false]);
  });

  it("states the rule only where a role that may delete sees a row without Delete (#1149, #1207)", () => {
    expect(toSaleChannelsViewProps({ ...mixed, canDelete: true }).inUseRule).toBe(CHANNEL_IN_USE_RULE);
    expect(toSaleChannelsViewProps(mixed).inUseRule).toBeUndefined();
    // Every row offers Delete, so there is nothing to explain.
    expect(toSaleChannelsViewProps({ channels: [mixed.channels[2]!], canDelete: true }).inUseRule).toBeUndefined();
    // An empty list offers no Delete, so it states no rule.
    expect(toSaleChannelsViewProps({ channels: [], canDelete: true }).inUseRule).toBeUndefined();
  });

  it("the rule names the system Taproom channel the RPC refuses (#1207)", () => {
    expect(CHANNEL_IN_USE_RULE).toMatch(/system Taproom channel/);
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
    expect(html).toMatch(/Taproom/);
    expect(html).toMatch(/DTC/);
    expect(html).toMatch(/Export/);
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
      rowTrailing: (row) => `T-${row.key}`,
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
    // Delete is drawn only on a row the model marks deletable (#1207).
    expect(src).toMatch(/row\.deletable && <DeleteCommandButton\b/);
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

  it.each(["", " \t\n\u00a0\ufeff"])("withholds Save for a blank channel name %j", name => {
    const html = htmlOf(createElement(ChannelView, { model: toChannelViewProps({ ...channelExport, name }) }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save channel<\/button>/);
    expect(html).toContain("Still needed: a channel name.");
  });

  it("enables Save for a trimmed nonblank name", () => {
    const html = htmlOf(createElement(ChannelView, { model: toChannelViewProps({ ...channelExport, name: " DTC " }) }));
    expect(html).toMatch(/<button(?![^>]*disabled=)[^>]*>Save channel<\/button>/);
  });

  it("links a duplicate-name error to the name input", () => {
    const html = htmlOf(createElement(ChannelView, {
      model: toChannelViewProps(channelExport),
      nameError: "A channel named DTC already exists.",
    }));
    expect(html).toMatch(/<input[^>]*aria-invalid="true"/);
    const errorId = /<input[^>]*aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(errorId).toBeDefined();
    expect(html).toContain(`id="${errorId}"`);
    expect(html).toContain("A channel named DTC already exists.");
  });

  it("keeps the same withheld submit when the live surface wraps the footer", () => {
    const html = htmlOf(createElement(ChannelView, {
      model: toChannelViewProps({ ...channelExport, name: " " }),
      footer: save => createElement("footer", null, save),
    }));
    expect(html).toMatch(/<footer>.*Still needed: a channel name\..*<button[^>]*disabled=""[^>]*>Save channel<\/button><\/footer>/);
  });

  it("disables Save during submission and honors an explicitly suppressed footer", () => {
    const model = toChannelViewProps(channelExport);
    expect(htmlOf(createElement(ChannelView, { model, submitting: true }))).toMatch(/<button[^>]*disabled=""[^>]*>Saving…<\/button>/);
    expect(htmlOf(createElement(ChannelView, { model, footer: null }))).not.toContain("Save channel");
  });

  it("maps Export onto chips index 1", () => {
    const model = toChannelViewProps(channelExport);
    expect(model.name).toBe("Export");
    expect(model.taxOptions).toEqual(["Taxable", "Export", "Vessel supplies", "Research", "Transfer in bond"]);
    expect(model.taxIndex).toBe(1);
  });

  it("labels vessel_supplies at chips index 2", () => {
    const model = toChannelViewProps({
      id: "c-vs",
      name: "Lab",
      tax_treatment: "vessel_supplies",
    });
    expect(model.taxIndex).toBe(2);
    expect(model.taxOptions[2]).toBe("Vessel supplies");
  });

  it("renders Channel name, labelled export chips with their hint, override info, and Save channel", () => {
    const html = htmlOf(createElement(ChannelView, { model: toChannelViewProps(channelExport) }));
    expect(html).toMatch(/Channel name/);
    expect(html).toMatch(/>Tax treatment</);
    // The hint changes with the selection, so it sits in a status region.
    expect(html).toContain('role="status"');
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

describe("Gravity unit", () => {
  it("maps get_gravity_unit Plato default onto chip indices with one label per unit (#1155)", () => {
    const model = toUnitsViewProps(unitsPlato);
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

  it("places the chips on brewery and mine when mine overrides brewery", () => {
    const model = toUnitsViewProps({ brewery: "plato", mine: "sg", effective: "sg" });
    expect(model.breweryIndex).toBe(0);
    expect(model.mineIndex).toBe(2);
  });

  it("the brewery part draws only the brewery default, saying who it affects (#671 review)", () => {
    const html = htmlOf(createElement(GravityUnitControls, { model: toUnitsViewProps(unitsPlato), part: "brewery" }));
    expect(html).toMatch(/>Gravity unit</);
    expect(html).toMatch(/>Plato \(°P\)</);
    expect(html).toMatch(/>Specific gravity \(SG\)</);
    expect(html).toContain("What everyone here sees unless they choose their own under Me.");
    expect(html).toContain("Readings are not changed.");
    expect(html).not.toMatch(/Use brewery default/);
    expect(html).not.toMatch(/A reading of/);
  });

  it("the personal part draws only your choice and the preview that follows it (#1155 review)", () => {
    const html = htmlOf(createElement(GravityUnitControls, { model: toUnitsViewProps({ brewery: "plato", mine: "sg", effective: "sg" }), part: "mine" }));
    expect(html).toContain("Use brewery default · Plato (°P)");
    expect(html).toContain("Yours alone; it changes nothing for anyone else.");
    expect(html).toContain("A reading of 12.5 °P shows as 1.050 SG.");
    expect(html).not.toContain("What everyone here sees");
  });

  it("Settings draws the brewery default with Brewery details and no Units row (#1509 item 7)", () => {
    const html = htmlOf(createElement(SettingsView, { model: settingsDemo }));
    expect(html).toContain("What everyone here sees unless they choose their own under Me.");
    expect(html.indexOf(">Brewery details<")).toBeLessThan(html.indexOf(">Gravity unit<"));
    expect(html.indexOf(">Gravity unit<")).toBeLessThan(html.indexOf(">People and places<"));
    expect(html).not.toMatch(/>Units</);
    expect(html).not.toMatch(/Use brewery default/);
  });

  it("Me draws Chat and your gravity unit (#1513 item 4)", () => {
    const html = htmlOf(createElement(MeView, { model: meMaria }));
    expect(html).toMatch(/>Chat</);
    expect(html).toContain("Link Slack and set your notifications");
    expect(html).toContain("Use brewery default · Plato (°P)");
    expect(html).not.toContain("What everyone here sees");
    const live = htmlOf(createElement(MeView, { model: { ...meMaria, units: undefined }, chatHref: "/settings/chat", units: "UNITS" }));
    expect(live).toMatch(/<a[^>]*href="\/settings\/chat"/);
    expect(live).toContain("UNITS");
  });

  it("the live Settings page and staff layout mount GravityUnitForm, each for its own part", () => {
    expect(readFileSync("app/(app)/settings/page.tsx", "utf8")).toMatch(/unitsForm=\{<GravityUnitForm part="brewery"/);
    const layout = readFileSync("app/(app)/layout.tsx", "utf8");
    expect(layout).toMatch(/<GravityUnitForm part="mine"/);
    expect(layout).toContain('chatHref="/settings/chat"');
    expect(existsSync("app/(app)/settings/units/page.tsx")).toBe(false);
    expect(SCREENS.some((s) => s.name === "Units")).toBe(false);
  });
});

it("puts a gravity choice back on the stored unit when its save fails (#447)", () => {
  const src = readFileSync(new URL("../app/(app)/settings/gravity-unit-form.tsx", import.meta.url), "utf8");
  expect(src).toContain('run("set_brewery_gravity_unit", { unit }).then(ok => { if (!ok) setBreweryChoice(brewery); })');
  expect(src).toContain('run("set_my_gravity_unit", { unit }).then(ok => { if (!ok) setMineChoice(mine); })');
});

it("shares the gravity unit controls between fixture and live adapters", () => {
  for (const view of ["settings", "me"]) expect(readFileSync(`components/mgr/views/${view}.tsx`, "utf8")).toContain("<GravityUnitControls");
  expect(readFileSync("app/(app)/settings/gravity-unit-form.tsx", "utf8")).toContain("<GravityUnitControls");
});
