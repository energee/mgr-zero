// tests/locations-view.test.ts — Locations, Location detail, Location bins,
// and Bin share adapters with list_locations / list_bins snapshots. Views
// own no sample data.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { BinView } from "../components/mgr/views/bin";
import { LocationView } from "../components/mgr/views/location";
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

describe("Locations list", () => {
  it("maps list_locations through kind, with optional units / taps / bins copy", () => {
    const model = toLocationsViewProps(locationsList);
    expect(model.rows.map((r) => [r.title, r.detail, r.href])).toEqual([
      ["Warehouse", "warehouse · 186 inventory units", `/locations/${LOC_WAREHOUSE.id}`],
      ["Taproom", "taproom · 11 taps · 3 bins", `/locations/${LOC_TAPROOM.id}`],
    ]);
    expect(model.empty).toBeUndefined();
  });

  it("uses kind alone when inventory extras are omitted", () => {
    const model = toLocationsViewProps({
      locations: [
        { id: LOC_WAREHOUSE.id, name: LOC_WAREHOUSE.name, kind: "warehouse" },
        { id: LOC_TAPROOM.id, name: LOC_TAPROOM.name, kind: "taproom" },
      ],
    });
    expect(model.rows.map((r) => r.detail)).toEqual(["warehouse", "taproom"]);
  });

  it("names an empty list without inventing rows", () => {
    const model = toLocationsViewProps({ locations: [] });
    expect(model.empty).toBe("No locations yet");
    expect(model.rows).toEqual([]);
  });

  it("the inventory drawing still offers Add location and Edit", () => {
    const html = htmlOf(createElement(LocationsView, { model: toLocationsViewProps(locationsList) }));
    expect(html).toMatch(/>Add location</);
    expect(html).toMatch(/>Edit</);
    expect(html).toMatch(/Warehouse/);
    expect(html).toMatch(/warehouse · 186 inventory units/);
    expect(html).toMatch(/Taproom/);
    expect(html).toMatch(/taproom · 11 taps · 3 bins/);
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
    expect(src).toContain('backHref: brewery.role === "admin" ? "/settings" : "/beer"');
  });
});

describe("Location detail", () => {
  it("maps a list_locations row plus bins and timezone extras", () => {
    const model = toLocationViewProps(locationTaproom);
    expect(model.name).toBe(LOC_TAPROOM.name);
    expect(model.type).toBe("Taproom");
    expect(model.typeOptions).toEqual(["Warehouse", "Taproom", "Storage"]);
    expect(model.timezone).toBe("Brewery default · America/New_York");
    expect(model.bins).toBe("Walk-in · Cold · Dry");
    expect(model.binsHref).toBe(`/locations/${LOC_TAPROOM.id}/bins`);
    expect(model.backHref).toBeUndefined();
  });

  it("timezone without an IANA extra is the brewery default", () => {
    const model = toLocationViewProps({
      location: locationTaproom.location,
      bins: locationTaproom.bins,
    });
    expect(model.timezone).toBe("Brewery default");
  });

  it("empty bins copy is none", () => {
    const model = toLocationViewProps({ location: locationTaproom.location, bins: [] });
    expect(model.bins).toBe("none");
  });

  it("the inventory drawing still has Save location and the type pick", () => {
    const html = htmlOf(createElement(LocationView, { model: toLocationViewProps(locationTaproom) }));
    expect(html).toMatch(/>Save location</);
    expect(html).toMatch(/Location name/);
    expect(html).toMatch(/Type/);
    expect(html).toMatch(/Taproom/);
    expect(html).toMatch(/Timezone/);
    expect(html).toMatch(/Brewery default · America\/New_York/);
    expect(html).toMatch(/Location bins/);
    expect(html).toMatch(/Walk-in · Cold · Dry/);
    expect(html).not.toMatch(/>Open</);
    expect(html).not.toMatch(/→/);
  });

  it("readOnly paints Type as a field and Open on bins, not Save", () => {
    const html = htmlOf(createElement(LocationView, {
      model: toLocationViewProps(locationTaproom),
      readOnly: true,
      headerAction: "EDIT",
    }));
    expect(html).toMatch(/EDIT/);
    expect(html).toMatch(/Type/);
    expect(html).toMatch(/Taproom/);
    expect(html).toMatch(/>Open</);
    expect(html).toMatch(new RegExp(`href="/locations/${LOC_TAPROOM.id}/bins"`));
    expect(html).not.toMatch(/>Save location</);
    expect(html).not.toMatch(/Location name/);
  });

  it("a footer slot replaces Save location", () => {
    const html = htmlOf(createElement(LocationView, {
      model: toLocationViewProps(locationTaproom),
      footer: "live footer",
    }));
    expect(html).toMatch(/live footer/);
    expect(html).not.toMatch(/>Save location</);
  });

  it("the Location detail inventory record is LocationView", () => {
    const body = screen("Location detail").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(LocationView);
    expect(body.props.model).toEqual(toLocationViewProps(locationTaproom));
  });

  it("the live location page mounts LocationView readOnly", () => {
    const src = readFileSync("app/(app)/locations/[id]/page.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/location"/);
    expect(src).toMatch(/<LocationView\b/);
    expect(src).toMatch(/readOnly/);
    expect(src).not.toMatch(/from "@\/components\/mgr\/e"/);
    expect(src).toMatch(/backHref: "\/locations"/);
  });
});

describe("Location bins", () => {
  it("maps list_bins with optional qty copy and the parent back label", () => {
    const model = toLocationBinsViewProps(locationBinsTaproom);
    expect(model.backLabel).toBe("Location detail");
    expect(model.backHref).toBeUndefined();
    expect(model.rows.map((r) => [r.title, r.detail])).toEqual([
      ["Walk-in", "38 cases · 12 kegs"],
      ["Cold", "22 cases"],
      ["Dry", "6 cases"],
    ]);
  });

  it("live bins without qty copy keep an empty detail", () => {
    const model = toLocationBinsViewProps({
      location: { id: LOC_TAPROOM.id, name: LOC_TAPROOM.name },
      bins: [{ id: "b1", name: "Walk-in" }],
    });
    expect(model.backLabel).toBe(LOC_TAPROOM.name);
    expect(model.rows[0]?.detail).toBe("");
  });

  it("the inventory drawing still offers Add bin and the trio", () => {
    const html = htmlOf(createElement(LocationBinsView, { model: toLocationBinsViewProps(locationBinsTaproom) }));
    expect(html).toMatch(/Location detail/);
    expect(html).toMatch(/Bins/);
    expect(html).toMatch(/Walk-in/);
    expect(html).toMatch(/38 cases · 12 kegs/);
    expect(html).toMatch(/Cold/);
    expect(html).toMatch(/22 cases/);
    expect(html).toMatch(/Dry/);
    expect(html).toMatch(/6 cases/);
    expect(html).toMatch(/>Add bin</);
    expect(html).not.toMatch(/→/);
  });

  it("createAction sits in the header and hides the inventory Add bin", () => {
    const html = htmlOf(createElement(LocationBinsView, {
      model: toLocationBinsViewProps(locationBinsTaproom),
      createAction: "ADD",
    }));
    expect(html).toMatch(/ADD/);
    expect(html).not.toMatch(/>Add bin</);
  });

  it("a bins slot replaces the inventory nav rows", () => {
    const html = htmlOf(createElement(LocationBinsView, {
      model: toLocationBinsViewProps(locationBinsTaproom),
      bins: [{ key: "cold", title: "Cold", detail: "live", action: "EDIT" }],
    }));
    expect(html).toMatch(/Cold/);
    expect(html).toMatch(/live/);
    expect(html).toMatch(/EDIT/);
    expect(html).not.toMatch(/Walk-in/);
    expect(html).toMatch(/>Add bin</);
  });

  it("the Location bins inventory record is LocationBinsView", () => {
    const body = screen("Location bins").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(LocationBinsView);
    expect(body.props.model).toEqual(toLocationBinsViewProps(locationBinsTaproom));
  });

  it("the live bins page mounts LocationBinsView", () => {
    const src = readFileSync("app/(app)/locations/[id]/bins/page.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/location-bins"/);
    expect(src).toMatch(/<LocationBinsView\b/);
    expect(src).not.toMatch(/from "@\/components\/mgr\/e"/);
    expect(src).toMatch(/backHref:/);
  });
});

describe("Bin sheet", () => {
  it("maps a list_bins row onto the Cold name", () => {
    const model = toBinViewProps(binCold);
    expect(model.name).toBe("Cold");
  });

  it("the inventory sheet still shows Save bin, last-bin info, and the tap-line note", () => {
    const html = htmlOf(createElement(BinView, { model: toBinViewProps(binCold) }));
    expect(html).toMatch(/Bin name/);
    expect(html).toMatch(/Cold/);
    expect(html).toMatch(/A location keeps at least one bin/);
    expect(html).toMatch(/Tap lines are not bins/);
    expect(html).toMatch(/>Save bin</);
    expect(html).not.toMatch(/→/);
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
  });

  it("the Bin inventory record is BinView", () => {
    const body = screen("Bin").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(BinView);
    expect(body.props.model).toEqual(toBinViewProps(binCold));
  });
});
