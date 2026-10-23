// tests/mgr-nav.test.ts — the shell's navigation logic below the component
// boundary: role filtering leaves no gaps, and the active tab is the longest
// href prefix of the current path (so /orders/123 lights Work, / lights Today).
import { describe, expect, it } from "vitest";
import { activeChild, activeTab, canOpen, isUnder, navAbout, navTitle, shippedNav, navFor, PORTAL_NAV, STAFF_NAV } from "../lib/mgr/nav";
import { STAFF_ROLES } from "../lib/mgr/enums";
import { workHrefsFor } from "../components/mgr/work-tabs";

describe("navFor", () => {
  it("admin sees every item", () => {
    const labels = navFor(STAFF_NAV, ["admin"]).flatMap((t) => (t.children ?? []).map((c) => c.label));
    for (const label of ["Taproom", "Taps", "Cellar", "Materials", "Kegs", "Batches", "Packaging", "Purchase orders", "Deliveries", "Recipes", "Compliance", "Planning", "Import", "Settings"]) {
      expect.soft(labels).toContain(label);
    }
  });
  it("hides role-restricted children without leaving an empty entry", () => {
    const sales = navFor(STAFF_NAV, ["sales"]);
    const work = sales.find((t) => t.label === "Work")!;
    expect(work.children!.map((c) => c.label)).toEqual(["Orders", "Replenishment"]);
    expect(sales.map((t) => t.label)).toEqual(["Today", "Beer", "Work", "More"]);
    expect(navFor(STAFF_NAV, ["sales"]).flatMap((t) => t.children ?? []).some((c) => c.label === "Settings")).toBe(false);
  });
  it("keeps only groups with a permitted child", () => {
    const warehouse = navFor(STAFF_NAV, ["warehouse"]);
    expect(warehouse.map((t) => t.label)).toEqual(["Today", "Beer", "Work", "More"]);
    // Menu is still planned; Vendors and Planning shipped with purchasing;
    // Units is shipped and open to every staff role, since a gravity display
    // unit is a personal preference rather than a permission
    // (set_my_gravity_unit admits all four roles).
    expect(warehouse.find((t) => t.label === "Beer")!.children!.map((c) => c.label)).toContain("Taproom");
    expect(warehouse.find((t) => t.label === "More")!.children!.map((c) => c.label)).toEqual(["Menu", "Vendors", "Planning", "Chat", "Units"]);
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
    expect(navFor(STAFF_NAV, ["brewer"]).map((t) => t.label)).toEqual(["Today", "Beer", "Work", "More"]);
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

describe("activeChild", () => {
  const beer = STAFF_NAV.find((t) => t.label === "Beer")!;
  const more = STAFF_NAV.find((t) => t.label === "More")!;
  it("picks only the longest matching child, never its parent path too (#446)", () => {
    expect(activeChild(beer, "/taproom/board")?.label).toBe("Taps");
    expect(activeChild(beer, "/taproom")?.label).toBe("Taproom");
    expect(activeChild(more, "/settings/units")?.label).toBe("Units");
    expect(activeChild(more, "/settings")?.label).toBe("Settings");
    expect(activeChild(more, "/settings/team")?.label).toBe("Settings");
  });
  it("returns undefined when no child matches", () => {
    expect(activeChild(beer, "/beer")).toBeUndefined();
  });
});

it("taproom has Beer and own settings without forbidden Work", () => {
  const nav = navFor(shippedNav(STAFF_NAV), ["taproom"]);
  expect(nav.map(t => t.label)).toEqual(["Today", "Beer", "More"]);
  expect(nav.find(t => t.label === "More")!.children!.map(t => t.label)).toEqual(["Chat", "Units"]);
  expect(nav.find(t => t.label === "Beer")!.children).toMatchObject([
    { label: "Taproom", href: "/taproom", roles: ["warehouse", "taproom"] },
    { label: "Taps", href: "/taproom/board", roles: ["warehouse", "taproom"] },
    { label: "Variance by brand", href: "/taproom/variance", roles: ["warehouse", "taproom"] },
  ]);
});

describe("canOpen", () => {
  it("reads the role gate of the deepest nav entry covering the path (#444)", () => {
    // /settings is admin-only; Units under it is not.
    expect(canOpen(["admin"], "/settings")).toBe(true);
    for (const role of ["sales", "brewer", "warehouse", "taproom"] as const) {
      expect.soft(canOpen([role], "/settings"), role).toBe(false);
      expect.soft(canOpen([role], "/settings/pos"), role).toBe(false);
      expect.soft(canOpen([role], "/settings/units"), role).toBe(true);
    }
    expect(canOpen(["warehouse"], "/more")).toBe(true);
  });
});

describe("navTitle", () => {
  it("names a page after the deepest nav entry covering its route (#1109)", () => {
    expect(navTitle("/")).toBe("Today");
    expect(navTitle("/orders")).toBe("Orders");
    expect(navTitle("/routes")).toBe("Deliveries");
    expect(navTitle("/taproom/board")).toBe("Taps");
    expect(navTitle("/settings/units")).toBe("Units");
    // A page with no entry of its own follows the section it sits in.
    expect(navTitle("/settings/team")).toBe("Settings");
    expect(navTitle("/orders/new")).toBe("Orders");
  });
  it("throws for a route no entry covers, so a moved page fails loudly", () => {
    expect(() => navTitle("/denied")).toThrow(/denied/);
  });
});

describe("multi-role navigation", () => {
  it("offers the exact union of every pair's destinations without duplicates", () => {
    for (const first of STAFF_ROLES) for (const second of STAFF_ROLES) {
      const paths = (roles: typeof STAFF_ROLES[number][]) => navFor(shippedNav(STAFF_NAV), roles)
        .flatMap(item => [item.href, ...(item.children ?? []).map(child => child.href)]);
      const union = [...new Set([...paths([first]), ...paths([second])])].sort();
      const combined = paths([first, second]);
      expect(combined.toSorted(), `${first}+${second}`).toEqual(union);
      expect(new Set(combined).size).toBe(combined.length);
    }
  });

  it("lets brewer+sales open production and customer work but not admin settings", () => {
    const roles = ["brewer", "sales"] as const;
    const labels = navFor(STAFF_NAV, roles).flatMap(item => (item.children ?? []).map(child => child.label));
    expect(labels).toEqual(expect.arrayContaining(["Batches", "Customers"]));
    expect(canOpen(roles, "/batches/new")).toBe(true);
    expect(canOpen(roles, "/customers/example")).toBe(true);
    expect(canOpen(roles, "/settings")).toBe(false);
    expect(workHrefsFor(roles)).toEqual({ all: "/work", orders: "/orders", batches: "/batches", runs: "/packaging" });
    expect(navFor(STAFF_NAV, roles).some(item => item.href.startsWith("/portal"))).toBe(false);
    expect(PORTAL_NAV.map(item => item.href)).toEqual(["/portal", "/portal/orders", "/portal/invoices", "/portal/account"]);
  });
});

describe("about", () => {
  // Search's Pages results and the More cards both print `about`, so every
  // staff entry a role can reach carries one short sentence-case line (#1106, #1134).
  it("describes every staff tab and child in sentence case", () => {
    for (const item of STAFF_NAV.flatMap(tab => [tab, ...(tab.children ?? [])])) {
      expect.soft(item.about, item.label).toMatch(/^[A-Z][^.]*[^.\s]$/);
    }
  });

  it("navAbout quotes an entry's line and refuses a label with none", () => {
    const chat = STAFF_NAV.find(t => t.label === "More")!.children!.find(c => c.label === "Chat")!;
    expect(navAbout("Chat")).toBe(chat.about);
    expect(() => navAbout("Formats")).toThrow(/Formats/);
  });
});
