// tests/screen-persona.test.ts — the explorer's persona switch is a demo
// user per role (lib/mgr/demo-personas.ts, kept apart from the app): the
// shell draws that person, the rail filters to their role, Today is their
// landing, and a tap into a route their role may not open lands on
// Permission denied — the same rule lib/mgr/nav.ts applies to the rail.
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import { SCREENS } from "../components/mgr/screens";
import { ScreenFrame } from "../components/mgr/screen-frame";
import { deniedFor, homeFor, needsFor, PERSONAS, personaFor } from "../lib/mgr/demo-personas";
import { asPersona } from "../components/mgr/demo-screens";
import { initialsOf } from "../components/mgr/user-avatar";

const by = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("persona", () => {
  it("is one demo user per staff role", () => {
    expect(PERSONAS.map((p) => p.role)).toEqual(["admin", "sales", "warehouse", "brewer"]);
    for (const p of PERSONAS) expect(p.name).toMatch(/\w+ \w+/);
    expect(personaFor("brewer").handle).toBe("@dave");
  });

  it("draws the shell as that person with their role's rail", () => {
    const brewer = renderToStaticMarkup(createElement(ScreenFrame, { screen: by("Orders"), persona: personaFor("brewer") }));
    const admin = renderToStaticMarkup(createElement(ScreenFrame, { screen: by("Orders") }));
    expect(admin).toContain("Customers");
    // The header face is decorative; the person shows as their initials.
    expect(admin).toContain(initialsOf("Maria Alvarez"));
    expect(brewer).not.toContain("Customers");
    expect(brewer).toContain("Cellar");
    expect(brewer).toContain(initialsOf(personaFor("brewer").name));
    expect(brewer).not.toContain(initialsOf("Maria Alvarez"));
  });

  it("lands each role on its own Today", () => {
    expect(homeFor("sales")).toBe("Sales");
    expect(homeFor("brewer")).toBe("Brewer");
    expect(homeFor("warehouse")).toBe("Today");
    expect(homeFor("admin")).toBe("Today");
  });

  it("refuses routes the role may not open, exactly as the rail does", () => {
    expect(deniedFor("brewer", "Customers")).toBe(true);
    expect(deniedFor("sales", "Pick sheet")).toBe(true);
    expect(deniedFor("brewer", "Cellar map")).toBe(false);
    expect(deniedFor("admin", "Customers")).toBe(false);
    // A screen with no route of its own (a sheet, a detail) is never refused here.
    expect(deniedFor("brewer", "Record movement")).toBe(false);
    expect(needsFor("Pick sheet")).toEqual(["admin", "warehouse"]);
    expect(needsFor("Customers")).toEqual(["admin", "sales"]);
  });

  it("redraws Me and Permission denied for the person, leaving every other screen alone", () => {
    const html = (name: string, refused?: string) =>
      renderToStaticMarkup(createElement("div", null, asPersona(by(name), personaFor("sales"), refused).body));
    expect(html("Me")).toContain("Sam Ortiz");
    expect(html("Me")).toContain("sam@demobrewing.com");
    expect(html("Me")).not.toContain("Maria");
    const denied = html("Permission denied", "Pick sheet");
    expect(denied).toContain("You do not have access to Pick sheet.");
    expect(denied).toContain("@sam · sales");
    expect(denied).toContain("admin or warehouse");
    expect(asPersona(by("Orders"), personaFor("sales"))).toBe(by("Orders"));
  });
});
