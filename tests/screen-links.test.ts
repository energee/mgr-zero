// tests/screen-links.test.ts — the explorer's tap resolver: which screen a
// tapped label (or shell link) opens. Three tiers: the record's own `to` map,
// the global label and route rules, then an exact screen-name match. The
// main flows must chain end to end so the explorer is a walkable prototype.
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { resolveTap, TAPS, ROUTES } from "../lib/mgr/screen-links";

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

  it("maps shell links by route", () => {
    expect(resolveTap(by("Today"), "Work", "/orders")).toBe("Orders");
    expect(resolveTap(by("Today"), "Pick", "/pick")).toBe("Pick sheet");
    expect(resolveTap(by("Shop"), "Orders", "/portal/orders")).toBe("Order history");
    expect(resolveTap(by("Today"), "?", "/nowhere")).toBeUndefined();
  });

  it("only ever names screens the inventory has", () => {
    for (const s of SCREENS) for (const t of Object.values(s.to ?? {})) expect(names, `${s.name}.to → ${t}`).toContain(t);
    for (const [, t] of TAPS) expect(names, `TAPS → ${t}`).toContain(t);
    for (const t of Object.values(ROUTES)) expect(names, `ROUTES → ${t}`).toContain(t);
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
    expect(walk("Shop", "Review order · $828.00", "Place order · $948.00")).toBe("Order detail");
    expect(resolveTap(by("Sign in"), "Forgot password?", null, "Reset password")).toBe("Reset password");
    expect(walk("Finished goods", "Hazy IPA · ½ bbl keg", "Record movement")).toBe("Record movement");
  });
});
