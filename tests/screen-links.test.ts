// tests/screen-links.test.ts — the explorer's tap resolver: which screen a
// tapped label (or shell link) opens. Three tiers: the record's own `to` map,
// the global label and route rules, then an exact screen-name match. The
// main flows must chain end to end so the explorer is a walkable prototype.
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { BACK, PORTAL, resolveTap, TAPS, ROUTES } from "../lib/mgr/screen-links";

const by = (name: string) => SCREENS.find((s) => s.name === name)!;
const names = new Set(SCREENS.map((s) => s.name));

describe("resolveTap", () => {
  it("prefers the record's own map, then global rules, then the exact name", () => {
    expect(resolveTap(by("Order"), "Adjust")).toBe("Short pick");
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
    expect(walk("Today", "Pick", "Orders", "ORD-0231 · Ridgeline", "Adjust")).toBe("Short pick");
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
    for (const name of ["Work", "Orders", "Batches", "Packaging runs", "Purchase orders", "Routes"]) {
      const html = renderToStaticMarkup(createElement("div", null, by(name).body));
      for (const to of Object.values(WORK_TABS)) expect(html, `${name} → ${to}`).toContain(`data-to="${to}"`);
    }
  });
});


describe("reported explorer flows", () => {
  it.each([
    ["Portal set password", "Save password", "Shop"],
    ["Menu", "Warehouse", "Menu"],
    ["Order history", "ORD-0231", "Order detail"],
    ["Order detail", "Orders", "Order history"],
    ["Order detail", "INV-1037", "Paid invoice"],
    ["Invoice history", "INV-1042", "Pay invoice"],
    ["Invoice history", "INV-1037", "Paid invoice"],
    ["Portal Me", "Change password", "Portal set password"],
    ["Set new password", "Save password", "Today"],
    ["Create brewery", "Create brewery", "First-run checklist"],
    ["Accounting", "Review", "Customers"],
    ["Mapping conflict", "Use", BACK],
    ["Mapping conflict", "Ridgeline Tap Room", "Mapping conflict"],
    ["Disconnect QuickBooks", "Disconnect QuickBooks", "Connect QuickBooks"],
    ["Disconnect Slack", "Disconnect Slack", "Chat disconnected"],
    ["Disconnect Square", "Disconnect Square", "Connect Square"],
    ["Connect QuickBooks", "Connect QuickBooks", "Accounting"],
    ["Connect Square", "Connect Square", "Square locations"],
    ["Point of sale", "Review", "Square → QuickBooks connector"],
    ["Square → QuickBooks connector", "Understood", BACK],
  ])("%s: %s → %s", (screen, tap, target) => {
    expect(resolveTap(by(screen), tap)).toBe(target);
  });

  it("keeps every portal screen accessible to every demo persona", async () => {
    const { deniedFor, needsFor, PERSONAS } = await import("../lib/mgr/demo-personas");
    for (const screen of SCREENS.filter(s => s.portal)) {
      expect(needsFor(screen.name)).toEqual([]);
      for (const persona of PERSONAS) expect(deniedFor(persona.role, screen.name)).toBe(false);
    }
    for (const screen of ["Settings", "Accounting", "Point of sale", "Chat settings", "Chat disconnected"])
      for (const role of ["sales", "warehouse"] as const) expect(deniedFor(role, screen), screen).toBe(true);
  });

  it("keeps deep-linked sheets over their owning pages", async () => {
    const { pageUnder } = await import("../lib/mgr/screen-explorer");
    for (const [sheet, page] of [["Question invoice", "Pay invoice"], ["Square locations", "Point of sale"], ["Square → QuickBooks connector", "Point of sale"], ["Disconnect Square", "Point of sale"], ["POS item", "Menu"], ["Disconnect Slack", "Chat settings"]]) {
      expect(SCREENS[pageUnder([], SCREENS.indexOf(by(sheet)))].name).toBe(page);
    }
  });
});
