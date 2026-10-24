import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { ComplianceMonthsView } from "../components/mgr/views/compliance-months";
import { navTitle, STAFF_NAV } from "../lib/mgr/nav";
import { MeSheetActions } from "../components/mgr/me-sheet";
import { VendorsView } from "../components/mgr/views/vendors";
import { toVendorsViewProps } from "../lib/mgr/vendors-view";

vi.mock("@/app/(auth)/actions", () => ({ logout: async () => {} }));

const destinations = [
  ["/inventory", "Finished goods"],
  ["/taproom", "Weekly count"],
  ["/taproom/board", "Tap board"],
  ["/materials", "Materials on hand"],
  ["/kegs", "Keg fleet"],
] as const;

describe("destination names", () => {
  it.each(destinations)("uses one sidebar, heading and tab name for %s", (href, name) => {
    const entry = STAFF_NAV.flatMap(tab => tab.children ?? []).find(item => item.href === href)!;
    const screen = SCREENS.find(screen => screen.name === name)!;
    expect(entry.label).toBe(name);
    expect(navTitle(href)).toBe(name);
    expect(renderToStaticMarkup(screen.body)).toContain(`>${entry.label}</h1>`);
  });
});

it("uses the canonical navigation title for the Pick sheet heading", () => {
  const screen = SCREENS.find(screen => screen.name === "Pick sheet")!;
  expect(renderToStaticMarkup(screen.body)).toContain(`>${navTitle("/pick")}</h1>`);
});

it("Compliance returns to More through the shared header", () => {
  const markup = renderToStaticMarkup(createElement(ComplianceMonthsView, {
    model: { backHref: "/more", cadences: ["Monthly"], cadence: 0, months: [], registry: { key: "registry", title: "Licenses", detail: "" }, lots: [] },
  }));
  expect(markup).toMatch(/href="\/more"[^>]*>[\s\S]*?More<\/a>/);
});

it("Vendors returns to More without replacing the shared header", () => {
  const markup = renderToStaticMarkup(createElement(VendorsView, {
    model: toVendorsViewProps({ backHref: "/more" }),
    createAction: createElement("button", null, "Add vendor"),
  }));
  expect(markup).toMatch(/href="\/more"[^>]*>[\s\S]*?More<\/a>/);
  expect(markup).toContain(">Vendors</h1>");
  expect(markup).toContain(">Add vendor</button>");
});

it.each(["/docs/staff-guide", "/docs/portal-guide"] as const)("opens %s separately so the app retains its place", guide => {
  const markup = renderToStaticMarkup(createElement(MeSheetActions, { guide }));
  expect(markup).toContain(`href="${guide}"`);
  expect(markup).toMatch(/target="_blank" rel="noopener noreferrer"/);
  expect(markup).toContain("(opens in a new tab)");
});
