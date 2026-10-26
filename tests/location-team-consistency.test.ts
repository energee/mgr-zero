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

it("marks the shared bin field invalid and explains why it cannot save", () => {
  const html = renderToStaticMarkup(createElement(BinView, { model: toBinViewProps({ name: "Dry", bins }), remove: null }));
  expect(html).toContain("A bin named Dry already exists here");
  expect(html).toContain('aria-invalid="true"');
  expect(html).toMatch(/<button[^>]*disabled[^>]*>Save bin/);
});

it("explains the empty bin name beside the unavailable save action", () => {
  const html = renderToStaticMarkup(createElement(BinView, { model: toBinViewProps({ name: " " }), remove: null }));
  expect(html).toContain("Still needed: a bin name.");
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

it("uses the saved member name with email beneath, or the RPC's full-email fallback", () => {
  expect(toTeamMemberRow({ userId: "ted", name: "Ted Brewer", email: "ted@demobrewing.com", roles: ["sales"] }, "ted").title).toBe("Ted Brewer");
  expect(toTeamMemberRow({ userId: "ted", name: "ted@demobrewing.com", email: "ted@demobrewing.com", roles: ["sales"] }, "ted")).toEqual({
    key: "ted", title: "ted@demobrewing.com", detail: "ted@demobrewing.com · Sales", you: true,
  });
  for (const row of teamRoster.rows) expect(row.detail).toMatch(/^[^@]+@[^ ]+ · /);
});

