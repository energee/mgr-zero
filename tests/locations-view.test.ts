// tests/locations-view.test.ts — Locations, Location detail with its Bins
// section, and Bin share adapters with list_locations / list_bins snapshots. Views
// own no sample data.
import { existsSync, readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { BinView, RemoveBinControl } from "../components/mgr/views/bin";
import { LocationFields, LocationView } from "../components/mgr/views/location";
import { LocationBinsView } from "../components/mgr/views/location-bins";
import { LocationsView } from "../components/mgr/views/locations";
import { LOC_TAPROOM, LOC_WAREHOUSE } from "../lib/mgr/fixtures/demo";
import { binCold, locationBinsTaproom, locationTaproom, locationsList } from "../lib/mgr/fixtures/locations";
import { toBinViewProps } from "../lib/mgr/bin-view";
import { toLocationViewProps } from "../lib/mgr/location-view";
import { toLocationBinsViewProps } from "../lib/mgr/location-bins-view";
import { toLocationsViewProps } from "../lib/mgr/locations-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;
const BINS_NOTE = "Bins are the rooms and racks inside a location where stock sits. Every new location starts with Cold, Dry and Walk-in. Admin and Warehouse add, rename or remove bins on the location page.";

describe("Locations list", () => {
  it("maps list_locations through every use, with optional units / taps / bins copy", () => {
    const model = toLocationsViewProps(locationsList);
    expect(model.rows.map((r) => [r.title, r.detail, r.href])).toEqual([
      ["Warehouse", "Warehouse · 186 inventory units", `/locations/${LOC_WAREHOUSE.id}`],
      ["Taproom", "Storage · Taproom · Warehouse · 11 taps · 3 bins", `/locations/${LOC_TAPROOM.id}`],
    ]);
    expect(model.empty).toBeUndefined();
  });

  it("uses the use list alone when inventory extras are omitted", () => {
    const model = toLocationsViewProps({
      locations: [
        { id: LOC_WAREHOUSE.id, name: LOC_WAREHOUSE.name, uses: ["warehouse"] },
        { id: LOC_TAPROOM.id, name: LOC_TAPROOM.name, uses: ["taproom", "storage"] },
      ],
    });
    expect(model.rows.map((r) => r.detail)).toEqual(["Warehouse", "Taproom · Storage"]);
  });

  it("names an empty list without inventing rows", () => {
    const model = toLocationsViewProps({ locations: [] });
    expect(model.empty?.title).toBe("No locations yet");
    expect(model.rows).toEqual([]);
  });

  it("the inventory drawing still offers Add location and Edit", () => {
    const html = htmlOf(createElement(LocationsView, { model: toLocationsViewProps(locationsList) }));
    expect(html).toMatch(/>Add location</);
    expect(html).toMatch(/>Edit</);
    expect(html).toMatch(/Warehouse/);
    expect(html).toMatch(/Warehouse · 186 inventory units/);
    expect(html).toMatch(/Taproom/);
    expect(html).toMatch(/Storage · Taproom · Warehouse · 11 taps · 3 bins/);
    expect(html).toMatch(/Settings/);
    expect(html).not.toMatch(/href="\/locations\//);
    expect(html).not.toMatch(/→/);
  });

  it("linkRows turns Edit into the location link", () => {
    const html = htmlOf(createElement(LocationsView, {
      model: toLocationsViewProps(locationsList),
      linkRows: true,
    }));
    expect(html).toMatch(new RegExp(`href="/locations/${LOC_WAREHOUSE.id}"`));
    expect(html).toMatch(new RegExp(`href="/locations/${LOC_TAPROOM.id}"`));
    expect(html).toMatch(/>Edit</);
  });

  it("createAction and footer slots replace Add location and take the inventory-by-location link", () => {
    const html = htmlOf(createElement(LocationsView, {
      model: toLocationsViewProps(locationsList),
      createAction: "ADD",
      footer: "Inventory by location",
    }));
    expect(html).toMatch(/ADD/);
    expect(html).not.toMatch(/>Add location</);
    expect(html).toMatch(/Inventory by location/);
  });

  it("null createAction hides Add location", () => {
    const html = htmlOf(createElement(LocationsView, {
      model: toLocationsViewProps(locationsList),
      createAction: null,
    }));
    expect(html).not.toMatch(/Add location/);
  });

  it("the Locations inventory record is LocationsView", () => {
    const body = screen("Locations").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Locations").body)).toBe(true);
    expect(body.type).toBe(LocationsView);
    expect(body.props.model).toEqual(toLocationsViewProps(locationsList));
  });

  it("the live Locations page mounts LocationsView with no second E.* tree", () => {
    const src = readFileSync("app/(app)/locations/page.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/locations"/);
    expect(src).toMatch(/<LocationsView\b/);
    expect(src).not.toMatch(/from "@\/components\/mgr\/e"/);
    expect(src).toContain('backHref: brewery.roles.includes("admin") ? "/settings" : "/beer"');
  });
});

describe("Location detail", () => {
  it("maps a list_locations row and the brewery's zone by name (#1148)", () => {
    const model = toLocationViewProps(locationTaproom);
    expect(model.name).toBe(LOC_TAPROOM.name);
    expect(model.uses).toEqual(["storage", "taproom", "warehouse"]);
    expect(model.usesLabel).toBe("Storage · Taproom · Warehouse");
    expect(model.timezone).toBe("Brewery default · Eastern Time (America/New_York)");
    expect(model.backHref).toBeUndefined();
  });

  it("the inventory drawing still has Save location and every use picked", () => {
    const html = htmlOf(createElement(LocationView, { model: toLocationViewProps(locationTaproom) }));
    expect(html).toMatch(/>Save location</);
    expect(html).toMatch(/Location name/);
    expect(html).toMatch(/Uses/);
    expect(html).toMatch(/Taproom/);
    expect(html).toMatch(/Storage/);
    expect(html).toMatch(/Warehouse/);
    expect(html).toMatch(/Timezone/);
    expect(html).toContain("Brewery default · Eastern Time (America/New_York)");
    expect(html).not.toMatch(/>Open</);
    expect(html).not.toMatch(/→/);
  });

  it("readOnly paints the uses as a field and the Bins section below, not an Open verb or Save (#1026, #1507)", () => {
    const html = htmlOf(createElement(LocationView, {
      model: toLocationViewProps(locationTaproom),
      readOnly: true,
      headerAction: "EDIT",
      bins: "BINS SECTION",
    }));
    expect(html).toMatch(/EDIT/);
    expect(html).toMatch(/Uses/);
    expect(html).toMatch(/Storage · Taproom · Warehouse/);
    expect(html).not.toMatch(/>Open</);
    expect(html).not.toContain("/bins");
    expect(html.indexOf("Storage · Taproom · Warehouse")).toBeLessThan(html.indexOf("BINS SECTION"));
    expect(html).not.toMatch(/>Save location</);
    expect(html).not.toMatch(/Location name/);
  });

  it("the Location name label focuses its input (#1148)", () => {
    const html = htmlOf(createElement(LocationFields, { name: "Taproom", uses: ["taproom"] }));
    const labelFor = /<label[^>]*for="([^"]+)"[^>]*>Location name</.exec(html)?.[1];
    expect(labelFor).toBeTruthy();
    expect(html).toMatch(new RegExp(`<input[^>]*id="${labelFor}"`));
  });

  it("the location fields say what a bin is and where bins are kept (#1148)", () => {
    const html = htmlOf(createElement(LocationFields, { name: "", uses: ["warehouse"] }));
    expect(html).toContain(BINS_NOTE);
  });

  it("the read-only detail explains bins above its Bins section (#1148)", () => {
    const html = htmlOf(createElement(LocationView, { model: toLocationViewProps(locationTaproom), readOnly: true }));
    expect(html).toContain(BINS_NOTE);
  });

  it("the inventory drawing paints the same location fields the live dialog mounts", () => {
    const html = htmlOf(createElement(LocationView, { model: toLocationViewProps(locationTaproom) }));
    const fields = renderToStaticMarkup(createElement(LocationFields, { name: LOC_TAPROOM.name, uses: ["storage", "taproom", "warehouse"] }));
    // useId differs between the two renders; compare with the ids removed.
    const withoutIds = (markup: string) => markup.replace(/(id|for|aria-describedby)="[^"]*"/g, "");
    expect(withoutIds(html)).toContain(withoutIds(fields));
  });

  it("the live Add/Edit location dialog mounts the shared LocationFields (#1148)", () => {
    const src = readFileSync("app/(app)/locations/location-form.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/location"/);
    expect(src).toMatch(/<LocationFields\b[^>]*controls=\{\{ name: setName, uses: setUses \}\}/);
    expect(src).not.toMatch(/<Label\b|<Input\b|<ToggleGroup\b/);
  });

  it("the live first-run step names every use and that one place can be several (#1148)", () => {
    const src = readFileSync("app/(app)/first-run.tsx", "utf8");
    expect(src).toContain('E.row("1 · Add locations", "warehouse, taproom, storage, or several at once"');
  });

  it("a footer slot replaces Save location", () => {
    const html = htmlOf(createElement(LocationView, {
      model: toLocationViewProps(locationTaproom),
      footer: "live footer",
    }));
    expect(html).toMatch(/live footer/);
    expect(html).not.toMatch(/>Save location</);
  });

  it("the Location detail inventory record is LocationView with LocationBinsView as its Bins section (#1507)", () => {
    const body = screen("Location detail").body as { type: unknown; props: { model: unknown; bins: { type: unknown; props: { model: unknown } } } };
    expect(body.type).toBe(LocationView);
    expect(body.props.model).toEqual(toLocationViewProps(locationTaproom));
    expect(body.props.bins.type).toBe(LocationBinsView);
    expect(body.props.bins.props.model).toEqual(toLocationBinsViewProps(locationBinsTaproom));
    expect(SCREENS.some((s) => s.name === "Location bins")).toBe(false);
  });

  it("the live location page mounts LocationView readOnly", () => {
    const src = readFileSync("app/(app)/locations/[id]/page.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/location"/);
    expect(src).toMatch(/<LocationView\b/);
    expect(src).toMatch(/readOnly/);
    expect(src).not.toMatch(/from "@\/components\/mgr\/e"/);
    expect(src).toMatch(/backHref: "\/locations"/);
    // The zone is the brewery's (Settings → Timezone), read from the membership (#1148).
    expect(src).toMatch(/timezone: brewery\.timeZone/);
  });

  it("the live location page mounts LocationBinsView as its Bins section; no separate bins route (#1507)", () => {
    const src = readFileSync("app/(app)/locations/[id]/page.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/location-bins"/);
    expect(src).toMatch(/bins=\{<LocationBinsView\b/);
    expect(src).toMatch(/inventoryHref: `\/inventory\?recordMovement=1&locationId=\$\{id\}`/);
    expect(src).toMatch(/rowActions=/);
    expect(existsSync("app/(app)/locations/[id]/bins/page.tsx")).toBe(false);
  });
});

describe("Location bins section", () => {
  const twoBins = [{ id: "b1", name: "Walk-in" }, { id: "b2", name: "Cold" }];

  it("counts each bin's get_bin_move_stock rows (#1154)", () => {
    const model = toLocationBinsViewProps(locationBinsTaproom);
    expect(model.rows.map((r) => [r.title, r.detail])).toEqual([
      ["Walk-in", "3 kinds of stock"],
      ["Cold", "1 kind of stock"],
      ["Dry", "Empty"],
    ]);
    expect(model.empty).toBeUndefined();
    expect(model.moveUnavailable).toBeNull();
  });

  it("says nothing about stock when the reader cannot see it", () => {
    const model = toLocationBinsViewProps({ bins: [{ id: "b1", name: "Walk-in" }] });
    expect(model.rows[0]?.detail).toBe("");
    expect(model.empty).toBeUndefined();
    expect(model.moveUnavailable).toBeNull();
  });

  it("an empty location gets the empty state, not a locked Move stock (#1154)", () => {
    const model = toLocationBinsViewProps({ bins: twoBins, stock: [] });
    expect(model.rows.map((r) => r.detail)).toEqual(["Empty", "Empty"]);
    expect(model.empty).toEqual({ title: "Nothing is stored in these bins yet", description: "Record stock into a bin from Inventory." });
    expect(model.moveUnavailable).toBeNull();
  });

  it("stock in a lone bin says why Move stock is unavailable", () => {
    const model = toLocationBinsViewProps({ bins: [twoBins[0]], stock: [{ bin_id: "b1" }] });
    expect(model.empty).toBeUndefined();
    expect(model.moveUnavailable).toBe("Moving stock needs at least two bins at this location. Add a bin first.");
  });

  it("the inventory drawing heads the section Bins, offers Add bin and the trio with what each holds", () => {
    const html = htmlOf(createElement(LocationBinsView, { model: toLocationBinsViewProps(locationBinsTaproom) }));
    expect(html).toMatch(/<h2[^>]*>Bins<\/h2>/);
    expect(html).not.toMatch(/<h1\b/);
    expect(html).toMatch(/Walk-in/);
    expect(html).toMatch(/3 kinds of stock/);
    expect(html).toMatch(/1 kind of stock/);
    expect(html).toMatch(/Empty/);
    expect(html).toMatch(/>Add bin</);
    expect(html).not.toMatch(/→/);
  });

  it("the empty state opens Record movement and replaces Move stock", () => {
    const html = htmlOf(createElement(LocationBinsView, {
      model: toLocationBinsViewProps({ bins: twoBins, stock: [], inventoryHref: "/inventory?recordMovement=1&locationId=l" }),
      footer: "live form",
    }));
    expect(html).toMatch(/Nothing is stored in these bins yet/);
    expect(html).toMatch(/Record stock into a bin from Inventory\./);
    expect(html).toMatch(/<a[^>]*href="\/inventory\?recordMovement=1&amp;locationId=l"[^>]*>Record movement<\/a>/);
    expect(html).not.toMatch(/live form/);
    expect(html).not.toMatch(/No stock is on hand/);
  });

  it("createAction sits in the header and hides the inventory Add bin", () => {
    const html = htmlOf(createElement(LocationBinsView, {
      model: toLocationBinsViewProps(locationBinsTaproom),
      createAction: "ADD",
    }));
    expect(html).toMatch(/ADD/);
    expect(html).not.toMatch(/>Add bin</);
  });

  it("rowActions put each bin's action beside the adapter's row, detail kept", () => {
    const html = htmlOf(createElement(LocationBinsView, {
      model: toLocationBinsViewProps(locationBinsTaproom),
      rowActions: { [locationBinsTaproom.bins[1].id]: "EDIT" },
    }));
    expect(html).toMatch(/Walk-in/);
    expect(html).toMatch(/1 kind of stock/);
    expect(html.match(/EDIT/g)).toHaveLength(1);
    expect(html).not.toMatch(/→/);
  });
});

describe("Bin sheet", () => {
  it("maps a list_bins row onto the Cold name", () => {
    const model = toBinViewProps(binCold);
    expect(model.name).toBe("Cold");
  });

  it("the inventory sheet shows Save bin and a tap note that points at the Tap board (#1154)", () => {
    const html = htmlOf(createElement(BinView, { model: toBinViewProps(binCold) }));
    expect(html).toMatch(/Bin name/);
    expect(html).toMatch(/Cold/);
    expect(html).toMatch(/Don’t add a bin for each tap\. Taps are managed on the <a[^>]*href="#"[^>]*>Tap board<\/a>\./);
    expect(html).not.toMatch(/Tap lines are not bins|tap board owns/);
    expect(html).toMatch(/>Save bin</);
    expect(html).not.toMatch(/→/);
  });

  it("the live tap note links the Tap board route", () => {
    const html = htmlOf(createElement(BinView, { model: toBinViewProps({ ...binCold, tapBoardHref: "/taproom/board" }) }));
    expect(html).toMatch(/<a[^>]*href="\/taproom\/board"[^>]*>Tap board<\/a>/);
  });

  it("Remove sits in its own section after Save, stating the delete_bin rule (#1154)", () => {
    const html = htmlOf(createElement(BinView, { model: toBinViewProps(binCold) }));
    const section = /<section aria-label="Remove bin"[^>]*>([\s\S]*?)<\/section>/.exec(html);
    expect(section?.[1]).toMatch(/<h2[^>]*>Remove bin<\/h2>/);
    expect(section?.[1]).not.toMatch(/data-slot="item-title"/);
    expect(section?.[1]).toMatch(/aria-label="Remove Cold"/);
    expect(section?.[1]).toMatch(/Only an unused bin, never the last one, can be removed\./);
    expect(section?.[1]).not.toMatch(/Save bin/);
    expect(html.indexOf(">Save bin<")).toBeLessThan(html.indexOf('aria-label="Remove bin"'));
  });

  it("the Remove confirmation states each rule delete_bin enforces, with its own fix", () => {
    const warning: string = RemoveBinControl({ bin: "Cold" }).props.warning;
    expect(warning).toMatch(/keeps at least one bin/);
    expect(warning).toMatch(/ever recorded stock cannot be removed; rename it instead/);
    expect(warning).toMatch(/POS menu uses cannot be removed until the menu uses another bin/);
    expect(warning).not.toMatch(/Only empty bins/);
  });

  it("a remove slot replaces the inventory Remove inside the section, and null drops the section", () => {
    const live = htmlOf(createElement(BinView, { model: toBinViewProps(binCold), remove: "LIVE REMOVE" }));
    expect(/<section aria-label="Remove bin"[^>]*>[\s\S]*?LIVE REMOVE[\s\S]*?<\/section>/.test(live)).toBe(true);
    const add = htmlOf(createElement(BinView, { model: toBinViewProps({ name: "" }), remove: null }));
    expect(add).not.toMatch(/Remove bin/);
  });

  it("a footer slot replaces Save bin", () => {
    const html = htmlOf(createElement(BinView, {
      model: toBinViewProps(binCold),
      footer: "live footer",
    }));
    expect(html).toMatch(/live footer/);
    expect(html).not.toMatch(/>Save bin</);
  });

  it("the live bin form mounts the shared controlled body", () => {
    const src = readFileSync("app/(app)/locations/bin-form.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/bin"/);
    expect(src).toMatch(/<BinView\b/);
    expect(src).toMatch(/controls=\{\{ name: setName \}\}/);
    expect(src).not.toMatch(/<Label\b|<Input\b/);
    expect(src).toMatch(/title=\{bin \? `Edit bin · \$\{bin\.name\}` : "Add bin"\}/);
    expect(src).toContain('tapBoardHref: "/taproom/board"');
    expect(src).toMatch(/remove=\{bin \? <RemoveBinControl/);
  });

  it("the Bin inventory record is BinView", () => {
    const body = screen("Bin").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(BinView);
    expect(body.props.model).toEqual(toBinViewProps(binCold));
  });
});
