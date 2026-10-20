// tests/location-scope.test.ts — #973: Weekly count, Tap board and Variance
// scope by one labeled Location select (ScopePick) that shows the selected
// taproom by name, drawn the same from the inventory fixtures and live models.
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import type { TapBoardNavigation } from "../components/mgr/views/tap-board";
import { TaproomVarianceView } from "../components/mgr/views/taproom-variance";
import { WeeklyCountView } from "../components/mgr/views/weekly-count";
import { taproomVariance, weeklyCount } from "../lib/mgr/fixtures/taproom";

/** The text of the control the visible `label` is for, or undefined when no label names one. */
function control(node: ReactNode, label: string) {
  const html = renderToStaticMarkup(createElement("div", null, node));
  const id = new RegExp(`<label[^>]*for="([^"]+)"[^>]*>${label}</label>`).exec(html)?.[1];
  const at = id === undefined ? -1 : html.indexOf(`id="${id}"`);
  return at < 0 ? undefined : html.slice(at, html.indexOf("</button>", at)).replace(/<[^>]+>/g, "");
}

const tapBoardRecord = SCREENS.find((screen) => screen.name === "Tap board")!.body as ReactElement<{ navigation: TapBoardNavigation }>;

it("Weekly count labels its Location select with the selected taproom", () => {
  expect(control(createElement(WeeklyCountView, { model: weeklyCount }), "Location")).toContain("Ridgeline Tap Room");
});

it("Variance labels its Location select with the selected taproom", () => {
  expect(control(createElement(TaproomVarianceView, { model: taproomVariance }), "Location")).toContain("Ridgeline Tap Room");
});

it("Tap board labels its Location select with the selected taproom", () => {
  expect(control(tapBoardRecord, "Location")).toContain("Taproom");
});

it("the Tap board inventory offers only taprooms, as the live route asks for", () => {
  expect(tapBoardRecord.props.navigation.locations.map((option) => option.label)).not.toContain("Warehouse");
});

/** True when the Location label comes before `heading` in the markup: the scope control sits above the list's heading, not between it and the list. */
function selectBeforeHeading(node: ReactNode, heading: string) {
  const html = renderToStaticMarkup(createElement("div", null, node));
  const select = html.search(/<label[^>]*>Location<\/label>/), title = html.indexOf(`>${heading}<`);
  expect(select, "Location label").toBeGreaterThan(-1);
  expect(title, heading).toBeGreaterThan(-1);
  return select < title;
}

it("Tap board draws the Location select above the On tap heading", () => {
  expect(selectBeforeHeading(tapBoardRecord, "On tap")).toBe(true);
});

it("Variance draws the Location select above the Variance by brand heading", () => {
  expect(selectBeforeHeading(createElement(TaproomVarianceView, { model: taproomVariance }), "Variance by brand")).toBe(true);
});
