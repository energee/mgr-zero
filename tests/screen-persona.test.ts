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
import { deniedFor, homeFor, LANDINGS, needsFor, PERSONAS, personaFor, PORTAL_BUYER, roleGaps } from "../lib/mgr/demo-personas";
import { writeFileSync } from "node:fs";
import { asPersona } from "../components/mgr/demo-screens";
import { initialsOf } from "../components/mgr/user-avatar";
import { sentenceCase } from "../lib/mgr/labels";

const by = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("persona", () => {
  it.each(["admin", "sales", "warehouse"] as const)("shows confirmation email diagnostics only to permitted %s staff", role => {
    for (const name of ["Order", "Order draft"]) {
      const html = renderToStaticMarkup(createElement("div", null, asPersona(by(name), personaFor(role)).body));
      expect(html.includes("Confirmation email")).toBe(role === "admin" || role === "sales");
    }
  });
  it.each(["admin", "warehouse", "sales", "brewer"] as const)("shows Inventory's taproom count pointer only to permitted %s staff", role => {
    const screen = asPersona(by("Finished goods"), personaFor(role));
    const html = renderToStaticMarkup(createElement("div", null, screen.body));
    expect(html.includes("Record taproom count")).toBe(role === "admin" || role === "warehouse");
    expect(html).not.toContain('href="/taproom"');
  });
  it("keeps personal Slack quiet hours unavailable to Taproom", () => {
    const screen = asPersona(by("My notification preferences"), { id: "taproom", roles: ["taproom"], name: "Taproom staff", handle: "@taproom" });
    const html = renderToStaticMarkup(createElement("div", null, screen.body));
    expect(html).not.toContain("Save my quiet hours");
    expect(html).toContain("Pick due");
    expect(html).toContain("More");
  });
  it.each([
    [["sales", "admin"], true],
    [["warehouse", "admin"], true],
    [["sales", "warehouse"], false],
    [["warehouse"], false],
  ] as const)("shows receipt Bill actions only when the persona role set %j contains admin", (roles, canPost) => {
    const screen = asPersona(by("Receipt"), { ...personaFor("admin"), roles: [...roles] });
    const html = renderToStaticMarkup(createElement("div", null, screen.body));
    expect(html.includes("Post Bill to QuickBooks")).toBe(canPost);
    expect(html).toContain("QuickBooks Bill");
  });
  it.each([
    ["Cellar map", "Add vessel"],
    ["Batches", "New vessel"],
    ["Vessel detail", "Save vessel"],
    ["Vessel detail", "Delete vessel"],
  ] as const)("draws %s's %s only for an admin", (name, label) => {
    const html = (id: "admin" | "brewer") => renderToStaticMarkup(createElement("div", null, asPersona(by(name), personaFor(id)).body));
    expect(html("admin")).toContain(label);
    expect(html("brewer")).not.toContain(label);
  });
  it("is one demo user per staff role, each on the Team screen with that role", () => {
    expect(PERSONAS.map((p) => p.id)).toEqual(["admin", "sales", "warehouse", "brewer"]);
    const team = renderToStaticMarkup(createElement("div", null, by("Team").body));
    for (const p of PERSONAS) {
      expect(team, `${p.name} is not on Team`).toContain(p.name);
      expect(team, `${p.name} has another role on Team`).toMatch(new RegExp(`${p.name} &lt;${p.handle.slice(1)}@demobrewing\\.com&gt;</div><p[^>]*>${p.roles.map(sentenceCase).join(", ")}</p>`));
      if (p.avatar) expect(team, `${p.name}'s face differs on Team`).toContain(p.avatar);
    }
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
    expect(deniedFor(["brewer"], "Customers")).toBe(true);
    expect(deniedFor(["sales"], "Pick sheet")).toBe(true);
    expect(deniedFor(["brewer"], "Cellar map")).toBe(false);
    expect(deniedFor(["admin"], "Customers")).toBe(false);
    // The movement record explicitly requires Admin or Warehouse.
    expect(deniedFor(["brewer"], "Record movement")).toBe(true);
    expect(needsFor("Pick sheet")).toEqual(["admin", "warehouse"]);
    expect(needsFor("Customers")).toEqual(["admin", "sales"]);
  });

  it("refuses commands whose record says who may run them (the permission state)", () => {
    expect(needsFor("Confirm order")).toEqual(["admin", "sales"]);
    expect(deniedFor(["brewer"], "Confirm order")).toBe(true);
    expect(deniedFor(["sales"], "Ship and invoice")).toBe(true);
    expect(deniedFor(["warehouse"], "Order")).toBe(false); // "warehouse reads"
    expect(deniedFor(["brewer"], "Order")).toBe(true);
    expect(deniedFor(["sales"], "Team")).toBe(true);
    expect(deniedFor(["admin"], "Team")).toBe(false);
  });

  it("names the landings the persona switch swaps, and reports the role-dependent screens it cannot", () => {
    expect(LANDINGS).toEqual(["Today", "Sales", "Brewer", "Driver", "Taproom"]);
    const gaps = roleGaps();
    // These say their rows vary by role but have one drawing: not wirable, only drawable.
    for (const name of ["Work", "More"]) expect(gaps.map((g) => g.name)).toContain(name);
    for (const g of gaps) expect(g.why).toBeTruthy();
    if (process.env.ROLE_REPORT) writeFileSync(process.env.ROLE_REPORT, gaps.map((g) => `- ${g.name}: ${g.why}`).join("\n"));
  });

  it("redraws personal screens and Orders actions for the person", () => {
    const html = (name: string, refused?: string) =>
      renderToStaticMarkup(createElement("div", null, asPersona(by(name), personaFor("sales"), refused).body));
    expect(html("Me")).toContain("Ted");
    expect(html("Me")).toContain("ted@demobrewing.com");
    expect(html("Me")).not.toContain("Maria");
    const denied = html("Permission denied", "Pick sheet");
    expect(denied).toContain("You do not have access to Pick sheet.");
    expect(denied).toContain("@ted · sales");
    expect(denied).toContain("admin or warehouse");
    const pickAction = /<(?:button|a)\b[^>]*data-row-action[^>]*>Pick<\/(?:button|a)>/;
    expect(html("Orders")).not.toMatch(pickAction);
    const warehouse = renderToStaticMarkup(createElement("div", null, asPersona(by("Orders"), personaFor("warehouse")).body));
    expect(warehouse).toMatch(pickAction);
    expect(warehouse).toContain(">Put back<");
    expect(warehouse).not.toContain(">Confirm<");
    expect(warehouse).not.toContain(">New order<");
    expect(asPersona(by("Settings"), personaFor("admin"))).toBe(by("Settings"));
  });
  it("signs the portal frames in as the demo buyer, never a staff person", () => {
    const portal = SCREENS.find((s) => s.portal && !s.surface)!;
    const html = renderToStaticMarkup(createElement(ScreenFrame, { screen: portal, persona: personaFor("sales") }));
    // The Me sheet is closed in static markup; the header avatar carries the buyer's initials.
    expect(html).toContain(initialsOf(PORTAL_BUYER.name));
    expect(html).not.toContain("ted.jpg");
  });

  it("does not let a parent tab's landing route grant its children: More lands on Invoices, warehouse may not open it", () => {
    expect(deniedFor(["warehouse"], "Invoices")).toBe(true);
    expect(deniedFor(["sales"], "Invoices")).toBe(false);
    expect(deniedFor(["brewer"], "Orders")).toBe(true);
  });
});
