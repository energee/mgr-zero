// tests/screen-links.test.ts — the explorer's tap resolver: which screen a
// tapped label (or shell link) opens. Three tiers: the record's own `to` map,
// the global label and route rules, then an exact screen-name match. The
// main flows must chain end to end so the explorer is a walkable prototype.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MeSheetActions } from "../components/mgr/me-sheet";
import { SCREENS } from "../components/mgr/screens";
import { BACK, INERT, isInertOn, PORTAL, resolveTap, TAPS, ROUTES } from "../lib/mgr/screen-links";
import { deniedFor, needsFor, PERSONAS } from "../lib/mgr/demo-personas";
import { pageUnder } from "../lib/mgr/screen-explorer";
import { WORK_FILTER_CHIPS } from "../lib/mgr/work-view";

vi.mock("@/app/(auth)/actions", () => ({ logout: async () => {} }));

const by = (name: string) => SCREENS.find((s) => s.name === name)!;
const names = new Set(SCREENS.map((s) => s.name));

describe("resolveTap", () => {
  it("keeps batch history and exact occupancy reading destinations distinct", () => {
    expect(resolveTap(by("Batches"), "B-0409")).toBe("Brew day");
    expect(resolveTap(by("Batches"), "FV1")).toBe("Vessel detail");
    expect(resolveTap(by("Batches"), "Reading")).toBe("Fermentation reading");
    expect(resolveTap(by("Batches"), "New batch")).toBe("New batch");
    expect(resolveTap(by("New batch"), "Schedule batch")).toBe("Batches");
  });
  it("opens the live invitation sheet and import route", () => {
    for (const name of ["Team", "First-run checklist"]) {
      expect(isInertOn(by(name), "Invite staff")).toBe(false);
      expect(resolveTap(by(name), "Invite staff")).toBe("Invite staff");
    }
    expect(resolveTap(by("Settings"), "Open", "/settings/import")).toBe("Import");
  });

  it("prefers the record's own map, then global rules, then the exact name", () => {
    expect(resolveTap(by("Orders"), "Confirm")).toBe("Confirm order");
    expect(resolveTap(by("Orders"), "New order")).toBe("New order");
    expect(resolveTap(by("Order"), "Orders")).toBe("Orders");
    expect(resolveTap(by("Orders"), "ORD-0231 · Ridgeline")).toBe("Order");
    expect(resolveTap(by("Invoices"), "INV-1042 · Ridgeline")).toBe("Invoice");
    expect(resolveTap(by("Today"), "Nothing like this")).toBeUndefined();
  });

  it("sends dismiss verbs back, never to a screen", () => {
    expect(resolveTap(by("New order"), "Cancel")).toBe(BACK);
    expect(resolveTap(by("Record movement"), "Discard")).toBe(BACK);
    expect(resolveTap(by("Order"), "Cancel order")).not.toBe(BACK);
  });

  it("maps shell links by route", () => {
    expect(resolveTap(by("Today"), "Work", "/orders")).toBe("Orders");
    expect(resolveTap(by("Today"), "Pick", "/pick")).toBe("Pick sheet");
    expect(resolveTap(by("Shop"), "Orders", "/portal/orders")).toBe("Order history");
    expect(resolveTap(by("Today"), "?", "/nowhere")).toBeUndefined();
  });

  it("only ever names screens the inventory has", () => {
    for (const s of SCREENS) for (const t of Object.values(s.to ?? {})) expect(names, `${s.name}.to → ${t}`).toContain(t);
    for (const [, t] of TAPS) if (t !== BACK) expect(names, `TAPS → ${t}`).toContain(t);
    for (const t of [...Object.values(ROUTES), ...Object.values(PORTAL)]) expect(names, `ROUTES/PORTAL → ${t}`).toContain(t);
  });

  it("walks the main flows end to end", () => {
    const walk = (from: string, ...taps: string[]) =>
      taps.reduce((at, tap) => {
        const next = resolveTap(by(at), tap);
        expect(next, `${at} → "${tap}"`).toBeDefined();
        return next!;
      }, from);
    expect(walk("Today", "Pick", "Orders", "ORD-0231 · Ridgeline", "Record pick")).toBe("Pick");
    expect(walk("Short pick", "Adjust order to 7 cases")).toBe("Pick");
    expect(walk("Orders", "Confirm", "Confirm order")).toBe("Order");
    expect(walk("Orders", "New order", "Save draft")).toBe("Order");
    expect(walk("Customers", "Ridgeline Tap Room", "Invite")).toBe("Invite portal user");
    // The portal is its own world: its entry screens never land on staff pages.
    expect(walk("Portal sign in", "Sign in")).toBe("Shop");
    expect(walk("Portal Me", "Sign out")).toBe("Portal sign in");
    expect(walk("Shop", "Me", "Sign out")).toBe("Portal sign in");
    expect(walk("Today", "Me")).toBe("Me");
    expect(walk("Order history", "ORD-0225")).toBe("Order detail");
    expect(walk("Shop", "Review order · $828.00", "Place order · $948.00")).toBe("Order detail");
    expect(resolveTap(by("Sign in"), "Forgot password?", null, "Reset password")).toBe("Reset password");
    expect(walk("Finished goods", "Hazy IPA · ½ bbl keg", "Record movement")).toBe("Record movement");
    expect(walk("Beer", "Weekly count")).toBe("Weekly count");
    expect(walk("Beer", "Tap board")).toBe("Tap board");
    expect(walk("Beer", "Materials on hand")).toBe("Materials on hand");
    expect(walk("Beer", "Keg fleet")).toBe("Keg fleet");
  });
});

// The Work chips are screens of their own: a chip carries the screen it opens
// so the explorer walks there, and a persona who may not open it never sees it.
describe("Work chips", () => {
  it("name the screen each chip opens", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { WORK_TABS } = await import("../components/mgr/screens");
    for (const name of Object.values(WORK_TABS)) expect(by(name), name).toBeDefined();
    for (const name of ["Work", "Orders", "Transfers", "Batches", "Packaging runs", "Purchase orders", "Routes", "Pick sheet", "Pars and allocation"]) {
      const html = renderToStaticMarkup(createElement("div", null, by(name).body));
      const destinations = name === "Work" ? WORK_FILTER_CHIPS.map(chip => WORK_TABS[chip]) : Object.values(WORK_TABS);
      for (const to of destinations) expect(html, `${name} → ${to}`).toContain(`data-to="${to}"`);
    }
  });
});


describe("reported explorer flows", () => {
  it.each([
    ["Portal set password", "Save password", "Shop"],
    ["Driver", "Resume", "Confirm delivery"],
    ["Menu", "Warehouse", "Menu"],
    ["Order history", "ORD-0231", "Order detail"],
    ["Order detail", "Orders", "Order history"],
    ["Order detail", "INV-1037", "Paid invoice"],
    ["Invoice history", "INV-1042", "Pay invoice"],
    ["Invoice history", "INV-1037", "Paid invoice"],
    ["Portal Me", "Change password", "Portal set password"],
    ["Set new password", "Save password", "Today"],
    ["Set new password", "Back to MGR", BACK],
    ["Portal set password", "Back to MGR", BACK],
    ["Page not found", "Back to Today", "Today"],
    ["Create brewery", "Create brewery", "First-run checklist"],
    ["Accounting", "Review", "Customers missing email"],
    ["Map to QuickBooks", "Save mapping", "Accounting"],
    ["Disconnect QuickBooks", "Disconnect QuickBooks", "Accounting"],
    ["Disconnect Slack", "Disconnect Slack", "Chat disconnected"],
    ["Disconnect Square", "Disconnect Square", "Point of sale"],
    ["Square locations", "Retire mapping", "Square locations"],
    ["Point of sale", "Open Accounting", "Accounting"],
  ])("%s: %s → %s", (screen, tap, target) => {
    expect(resolveTap(by(screen), tap)).toBe(target);
  });

  it("keeps every portal screen accessible to every demo persona", () => {
    for (const screen of SCREENS.filter(s => s.portal)) {
      expect(needsFor(screen.name)).toEqual([]);
      for (const persona of PERSONAS) expect(deniedFor(persona.roles, screen.name)).toBe(false);
    }
    for (const screen of ["Settings", "Accounting", "Point of sale", "Chat settings", "Chat disconnected"])
      for (const role of ["sales", "warehouse"] as const) expect(deniedFor([role], screen), screen).toBe(true);
  });

  it("keeps deep-linked sheets over their owning pages", () => {
    for (const [sheet, page] of [["Question invoice", "Pay invoice"], ["Square locations", "Point of sale"], ["Disconnect Square", "Point of sale"], ["POS item", "Menu"], ["Disconnect Slack", "Chat settings"]]) {
      expect(SCREENS[pageUnder([], SCREENS.indexOf(by(sheet)))].name).toBe(page);
    }
  });
});

// A label in the global INERT list acts in place wherever it appears — but a
// screen that explicitly maps the label meant it, and the record's own `to`
// map is the first tier of the resolver. The explorer must not let the
// suppression list silently outrank it.
describe("isInertOn", () => {
  it("opens mapping controls locally without redirecting QuickBooks edits to POS", () => {
    for (const name of ["QuickBooks mappings", "Invoice mappings"]) expect(isInertOn(by(name), "Map")).toBe(true);
  });
  it("still suppresses an inert label the screen does not map", () => {
    expect(isInertOn(by("Pars and allocation"), "Paid")).toBe(true);
    expect(isInertOn(by("Pars and allocation"), "Print labels")).toBe(true);
  });

  it("honours an explicit data-to over the inert list", () => {
    expect(isInertOn(by("Today"), "Paid", "Invoice")).toBe(false);
  });

  it("keeps replenishment quantity edits and reservation reviews local instead of opening unrelated screens", () => {
    const screen = by("Pars and allocation");
    for (const label of ["Set taproom par", "Set standing allocation", "Release", "Review"]) {
      expect(isInertOn(screen, label), label).toBe(true);
      expect(screen.to?.[label], label).toBeUndefined();
    }
    expect(resolveTap(screen, "Create replenishment order")).toBe("Order");
    expect(isInertOn(screen, "Review", "Order")).toBe(false);
    expect(resolveTap(by("Finished goods"), "Shortfall", "/replenishment?sku=lantern-pils-case#shortfalls")).toBe("Pars and allocation");
  });

  it("suppresses no author-written mapping on any screen", () => {
    // Both tiers resolveTap honours above the global rules: the record's own
    // map, and PORTAL on a portal screen. Neither may be swallowed by INERT.
    const swallowed = SCREENS.flatMap((s) => [
      ...Object.keys(s.to ?? {}),
      ...(s.portal ? Object.keys(PORTAL) : []),
    ].filter((label) => isInertOn(s, label)).map((label) => `${s.name}: ${label}`));
    expect(swallowed).toEqual([]);
  });

  it("keeps the Accounting sync button on Accounting under either label", () => {
    // The live view renders one button, labelled "Sync QuickBooks" or "Retry
    // saved sync", that syncs in place. Both labels map to Accounting, so
    // neither may also sit in INERT as a contradicting second answer.
    expect(INERT).not.toContain("Retry saved sync");
    expect(INERT).not.toContain("Sync QuickBooks");
    expect(resolveTap(by("Accounting"), "Retry saved sync")).toBe("Accounting");
  });
});

describe("Me guide link (#718)", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("each live Me sheet links its audience's guide", () => {
    expect(read("app/(app)/layout.tsx")).toMatch(/<MeSheetActions guide="\/docs\/staff-guide" \/>/);
    for (const guide of ["/docs/staff-guide", "/docs/portal-guide"] as const) {
      const markup = renderToStaticMarkup(createElement(MeSheetActions, { guide }));
      expect(markup).toContain(`href="${guide}"`);
      expect(markup).toMatch(/target="_blank" rel="noopener noreferrer"/);
      expect(markup).toContain("(opens in a new tab)");
    }
  });
  it("shows Guide in both inventory Me sheets as a link out", () => {
    for (const name of ["Me", "Portal Me"]) expect(isInertOn(by(name), "Guide"), name).toBe(true);
  });
});
