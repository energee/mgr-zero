import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BinView } from "@/components/mgr/views/bin";
import { LocationsInventoryLink, LocationsView } from "@/components/mgr/views/locations";
import { locationsList } from "@/lib/mgr/fixtures/locations";
import { toLocationsViewProps } from "@/lib/mgr/locations-view";
import { teamRoster } from "@/lib/mgr/fixtures/team";
import { toBinViewProps } from "@/lib/mgr/bin-view";
import { timezoneLabel } from "@/lib/mgr/labels";
import { toTeamMemberRow } from "@/lib/mgr/team-view";

const bins = [{ id: "dry", name: "Dry" }, { id: "cold", name: "Cold" }];

it("blocks a duplicate bin name after trimming, but permits its own unchanged name", () => {
  expect(toBinViewProps({ name: " Dry ", bins }).nameError).toBe("A bin named Dry already exists here");
  expect(toBinViewProps({ name: "Dry", bins, binId: "dry" }).nameError).toBeUndefined();
  expect(toBinViewProps({ name: "Dry", bins, binId: "cold" }).nameError).toBe("A bin named Dry already exists here");
  expect(toBinViewProps({ name: "New rack", bins }).nameError).toBeUndefined();
  expect(toBinViewProps({ name: "", bins }).nameError).toBeUndefined();
  expect(toBinViewProps({ name: "Rack", bins: [{ id: "rack", name: " Rack " }] }).nameError).toBe("A bin named Rack already exists here");
});

it("blocks case variants while preserving the existing display name in feedback", () => {
  for (const name of ["dry", " DRY ", "dRy"]) {
    expect(toBinViewProps({ name, bins }).nameError).toBe("A bin named Dry already exists here");
    expect(toBinViewProps({ name, bins, binId: "cold" }).nameError).toBe("A bin named Dry already exists here");
  }
  expect(toBinViewProps({ name: "dry", bins, binId: "dry" }).nameError).toBeUndefined();
  const historical = [...bins, { id: "legacy", name: "dry" }];
  expect(toBinViewProps({ name: "Dry", bins: historical, binId: "dry" }).nameError).toBeUndefined();
  expect(toBinViewProps({ name: "DRY", bins: historical, binId: "dry" }).nameError).toBe("A bin named dry already exists here");
});

it("marks the shared bin field invalid and explains why it cannot save", () => {
  const html = renderToStaticMarkup(createElement(BinView, { model: toBinViewProps({ name: "Dry", bins }), remove: null }));
  expect(html).toContain("A bin named Dry already exists here");
  expect(html).toContain('aria-invalid="true"');
  expect(html).toMatch(/<button[^>]*disabled[^>]*>Save bin/);
});

it("keeps Save unavailable when the bin name is blank", () => {
  const html = renderToStaticMarkup(createElement(BinView, { model: toBinViewProps({ name: " " }), remove: null }));
  expect(html).toMatch(/<button[^>]*disabled[^>]*>Save bin/);
});

it("shows a season-independent readable timezone with its exact stored identifier", () => {
  expect(timezoneLabel("America/New_York")).toBe("Eastern Time (America/New_York)");
  expect(timezoneLabel("America/Chicago")).toBe("Central Time (America/Chicago)");
  expect(timezoneLabel("Europe/London")).toBe("United Kingdom Time (Europe/London)");
});


it("explains the global stock link in both inventory and live Locations", () => {
  const inventory = renderToStaticMarkup(createElement(LocationsView, { model: toLocationsViewProps(locationsList) }));
  const live = renderToStaticMarkup(createElement(LocationsInventoryLink, { href: "/inventory" }));
  for (const html of [inventory, live]) expect(html).toContain("See finished goods across all locations");
  expect(live).toContain('href="/inventory"');
});

it("titles a member with the RPC's identity label and lists only the roles beneath", () => {
  expect(toTeamMemberRow({ userId: "ted", name: "Ted Brewer <ted@demobrewing.com>", roles: ["sales"] }, "ted")).toEqual({
    key: "ted", title: "Ted Brewer <ted@demobrewing.com>", detail: "Sales", you: true,
  });
  expect(toTeamMemberRow({ userId: "ted", name: "ted@demobrewing.com", roles: ["sales"] })).toEqual({
    key: "ted", title: "ted@demobrewing.com", detail: "Sales", you: false,
  });
  for (const row of teamRoster.rows) {
    expect(row.title).toContain("@");
    expect(row.detail).not.toContain("@");
  }
});

