// tests/screen-persona.test.ts — the explorer's persona switch: a screen
// drawn as a role shows that role's rail (the Me sheet names the role once
// opened), and Today is the
// role's own landing (Sales, Brewer) where one is drawn.
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import { SCREENS } from "../components/mgr/screens";
import { ScreenFrame } from "../components/mgr/screen-frame";
import { homeFor, PERSONAS } from "../lib/mgr/screen-explorer";

const by = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("persona", () => {
  it("draws the rail and Me sheet for the chosen role", () => {
    const brewer = renderToStaticMarkup(createElement(ScreenFrame, { screen: by("Orders"), role: "brewer" }));
    const admin = renderToStaticMarkup(createElement(ScreenFrame, { screen: by("Orders") }));
    expect(admin).toContain("Customers");
    expect(brewer).not.toContain("Customers");
    expect(brewer).toContain("Cellar");
  });

  it("lands each role on its own Today", () => {
    expect(PERSONAS).toEqual(["admin", "sales", "warehouse", "brewer"]);
    expect(homeFor("sales")).toBe("Sales");
    expect(homeFor("brewer")).toBe("Brewer");
    expect(homeFor("warehouse")).toBe("Today");
    expect(homeFor("admin")).toBe("Today");
  });
});
