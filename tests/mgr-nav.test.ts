// tests/mgr-nav.test.ts — the shell's navigation logic below the component
// boundary: role filtering leaves no gaps, and the active tab is the longest
// href prefix of the current path (so /orders/123 lights Work, / lights Today).
import { describe, expect, it } from "vitest";
import { activeTab, isUnder, navFor, PORTAL_NAV, STAFF_NAV } from "../lib/mgr/nav";

describe("navFor", () => {
  it("admin sees every item", () => {
    const labels = navFor(STAFF_NAV, "admin").flatMap((t) => (t.children ?? []).map((c) => c.label));
    for (const label of ["Taproom", "Taps", "Cellar", "Materials", "Kegs", "Batches", "Packaging", "POs", "Deliveries", "Recipes", "Compliance", "Planning", "Import", "Settings"]) {
      expect.soft(labels).toContain(label);
    }
  });
  it("hides role-restricted children without leaving an empty entry", () => {
    const sales = navFor(STAFF_NAV, "sales");
    const work = sales.find((t) => t.label === "Work")!;
    expect(work.children!.map((c) => c.label)).toEqual(["Orders"]);
    expect(sales.map((t) => t.label)).toEqual(["Today", "Beer", "Work", "More"]);
    expect(navFor(STAFF_NAV, "sales").flatMap((t) => t.children ?? []).some((c) => c.label === "Settings")).toBe(false);
  });
  it("keeps only groups with a permitted child", () => {
    const warehouse = navFor(STAFF_NAV, "warehouse");
    expect(warehouse.map((t) => t.label)).toEqual(["Today", "Beer", "Work", "More"]);
    expect(warehouse.find((t) => t.label === "More")!.children!.map((c) => c.label)).toEqual(["Planning"]);
  });
});

describe("isUnder", () => {
  it("matches the href and routes beneath it, but never treats / as a prefix", () => {
    expect(isUnder("/orders", "/orders")).toBe(true);
    expect(isUnder("/orders/abc", "/orders")).toBe(true);
    expect(isUnder("/ordersx", "/orders")).toBe(false);
    expect(isUnder("/orders", "/")).toBe(false);
    expect(isUnder("/", "/")).toBe(true);
  });
});

describe("navFor brewer", () => {
  it("offers the brewer's production areas", () => {
    expect(navFor(STAFF_NAV, "brewer").map((t) => t.label)).toEqual(["Today", "Beer", "Work", "More"]);
  });
});

describe("activeTab", () => {
  it("matches the longest href prefix", () => {
    expect(activeTab(STAFF_NAV, "/")?.label).toBe("Today");
    expect(activeTab(STAFF_NAV, "/orders/abc")?.label).toBe("Work");
    expect(activeTab(STAFF_NAV, "/settings/team")?.label).toBe("More");
    expect(activeTab(PORTAL_NAV, "/portal/orders/1")?.label).toBe("Orders");
    expect(activeTab(PORTAL_NAV, "/portal")?.label).toBe("Order");
    expect(activeTab(PORTAL_NAV, "/portal/account")?.label).toBe("Account");
  });

  it("includes Account on the portal shell", () => {
    expect(PORTAL_NAV.map((t) => t.label)).toEqual(["Order", "Orders", "Invoices", "Account"]);
  });
  it("returns undefined off the map", () => {
    expect(activeTab(STAFF_NAV, "/nowhere")).toBeUndefined();
  });
});
