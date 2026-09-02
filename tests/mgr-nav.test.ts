// tests/mgr-nav.test.ts — the shell's navigation logic below the component
// boundary: role filtering leaves no gaps, and the active tab is the longest
// href prefix of the current path (so /orders/123 lights Work, / lights Today).
import { describe, expect, it } from "vitest";
import { activeTab, navFor, PORTAL_NAV, STAFF_NAV } from "../lib/mgr/nav";

describe("navFor", () => {
  it("admin sees every item", () => {
    const labels = navFor(STAFF_NAV, "admin").flatMap((t) => (t.children ?? []).map((c) => c.label));
    expect(labels).toContain("Settings");
    expect(labels).toContain("Pick");
  });
  it("hides role-restricted children without leaving an empty entry", () => {
    const sales = navFor(STAFF_NAV, "sales");
    const work = sales.find((t) => t.label === "Work")!;
    expect(work.children!.map((c) => c.label)).toEqual(["Orders"]);
    expect(sales.map((t) => t.label)).toEqual(["Today", "Beer", "Work", "More"]);
    expect(navFor(STAFF_NAV, "sales").flatMap((t) => t.children ?? []).some((c) => c.label === "Settings")).toBe(false);
  });
});

describe("activeTab", () => {
  it("matches the longest href prefix", () => {
    expect(activeTab(STAFF_NAV, "/")?.label).toBe("Today");
    expect(activeTab(STAFF_NAV, "/orders/abc")?.label).toBe("Work");
    expect(activeTab(STAFF_NAV, "/settings/team")?.label).toBe("More");
    expect(activeTab(PORTAL_NAV, "/portal/orders/1")?.label).toBe("Orders");
    expect(activeTab(PORTAL_NAV, "/portal")?.label).toBe("Order");
  });
  it("returns undefined off the map", () => {
    expect(activeTab(STAFF_NAV, "/nowhere")).toBeUndefined();
  });
});
