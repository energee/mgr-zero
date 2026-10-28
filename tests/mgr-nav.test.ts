// tests/mgr-nav.test.ts — the shell's navigation logic below the component
// boundary: role filtering leaves no gaps, and the active tab is the longest
// href prefix of the current path (so /orders/123 lights Work, / lights Today).
import { describe, expect, it } from "vitest";
import { activeChild, activeTab, canOpen, isUnder, navAbout, navGroups, navTitle, shippedNav, navFor, PORTAL_NAV, STAFF_NAV, UNLISTED_NAV, type NavItem } from "../lib/mgr/nav";
import { searchDestinations } from "../lib/mgr/search-palette-state";
import { STAFF_ROLES } from "../lib/mgr/enums";
import { workHrefsFor } from "../components/mgr/work-tabs";

describe("navFor", () => {
  it("admin sees every item", () => {
    const labels = navFor(STAFF_NAV, ["admin"]).flatMap((t) => (t.children ?? []).map((c) => c.label));
    for (const label of ["Weekly count", "Tap board", "Cellar", "Materials on hand", "Keg fleet", "Batches", "Packaging", "Purchase orders", "Deliveries", "Recipes", "Compliance", "Planning", "Settings"]) {
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
    // Chat and the personal gravity unit live in the Me sheet, not More (#1513).
    expect(warehouse.find((t) => t.label === "Beer")!.children!.map((c) => c.label)).toContain("Weekly count");
    expect(warehouse.find((t) => t.label === "More")!.children!.map((c) => c.label)).toEqual(["Menu", "Vendors", "Planning"]);
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
    expect(activeChild(beer, "/taproom/board")?.label).toBe("Tap board");
    expect(activeChild(beer, "/taproom")?.label).toBe("Weekly count");
    expect(activeChild(more, "/settings")?.label).toBe("Settings");
    expect(activeChild(more, "/settings/team")?.label).toBe("Settings");
  });
  it("returns undefined when no child matches", () => {
    expect(activeChild(beer, "/beer")).toBeUndefined();
  });
});

it("taproom has Today and Beer, with no Work and no More (#1513)", () => {
  const nav = navFor(shippedNav(STAFF_NAV), ["taproom"]);
  expect(nav.map(t => t.label)).toEqual(["Today", "Beer"]);
  expect(nav.find(t => t.label === "Beer")!.children).toMatchObject([
    { label: "Weekly count", href: "/taproom", roles: ["warehouse", "taproom"] },
    { label: "Tap board", href: "/taproom/board", roles: ["warehouse", "taproom"] },
    { label: "Variance by brand", href: "/taproom/variance", roles: ["warehouse", "taproom"] },
  ]);
});

describe("canOpen", () => {
  it("reads the role gate of the deepest nav entry covering the path (#444)", () => {
    // /settings is admin-only; Chat under it is not.
    expect(canOpen(["admin"], "/settings")).toBe(true);
    for (const role of ["sales", "brewer", "warehouse", "taproom"] as const) {
      expect.soft(canOpen([role], "/settings"), role).toBe(false);
      expect.soft(canOpen([role], "/settings/pos"), role).toBe(false);
      expect.soft(canOpen([role], "/settings/chat"), role).toBe(true);
      expect.soft(canOpen([role], "/locations"), role).toBe(false);
    }
    expect(canOpen(["admin"], "/locations")).toBe(true);
    expect(canOpen(["warehouse"], "/more")).toBe(true);
  });
});

describe("navTitle", () => {
  it("names a page after the deepest nav entry covering its route (#1109)", () => {
    expect(navTitle("/")).toBe("Today");
    expect(navTitle("/orders")).toBe("Orders");
    expect(navTitle("/routes")).toBe("Deliveries");
    expect(navTitle("/taproom/board")).toBe("Tap board");
    expect(navTitle("/settings/chat")).toBe("Chat");
    expect(navTitle("/settings/import")).toBe("Import");
    expect(navTitle("/settings/channels")).toBe("Sale channels");
    expect(navTitle("/locations")).toBe("Locations");
    expect(navTitle("/settings/team")).toBe("Team");
  });
  it.each([
    ["/kegs/report", "Keg report"],
    ["/kegs/history", "Keg history"],
    ["/cellar/vessels/new", "New vessel"],
    ["/catalog/water-profiles", "Water profiles"],
    ["/catalog/brands/new", "New brand"],
    ["/recipes/new", "New recipe"],
    ["/orders/new", "New order"],
    ["/compliance/licenses", "Licenses"],
    ["/settings/accounting", "Accounting"],
    ["/settings/accounting/connect", "Connect QuickBooks"],
    ["/settings/chat/preferences", "My notification preferences"],
    ["/settings/pos", "Point of sale"],
  ])("names the subpage %s rather than its section (#1255)", (route, title) => {
    expect(navTitle(route)).toBe(title);
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
    expect(workHrefsFor(roles)).toEqual({ all: "/work", orders: "/orders", batches: "/batches", runs: "/packaging", replenishment: "/replenishment" });
    expect(navFor(STAFF_NAV, roles).some(item => item.href.startsWith("/portal"))).toBe(false);
    expect(PORTAL_NAV.map(item => item.href)).toEqual(["/portal", "/portal/orders", "/portal/invoices", "/portal/account"]);
  });
});

describe("about", () => {
  // Search's Pages results and the More cards both print `about`, so every
  // staff entry a role can reach carries one short sentence-case line (#1106, #1134).
  it("describes every staff tab and child in sentence case", () => {
    for (const item of [...STAFF_NAV.flatMap(tab => [tab, ...(tab.children ?? [])]), ...UNLISTED_NAV]) {
      expect.soft(item.about, item.label).toMatch(/^[A-Z][^.]*[^.\s]$/);
    }
  });

  it("navAbout quotes an entry's line and refuses a label with none", () => {
    const chat = UNLISTED_NAV.find(c => c.label === "Chat")!;
    expect(navAbout("Chat")).toBe(chat.about);
    expect(() => navAbout("Formats")).toThrow(/Formats/);
  });
});

describe("navGroups (#1159)", () => {
  const moreFor = (roles: Parameters<typeof navFor>[1]) => navFor(shippedNav(STAFF_NAV), roles).find(t => t.label === "More")!.children!;
  const drawn = (items: readonly NavItem[]) => navGroups(items).map(g => [g.group, g.items.map(i => i.label)]);

  it("files every More entry under one area", () => {
    for (const c of STAFF_NAV.find(t => t.label === "More")!.children!) expect.soft(c.group, c.label).toBeDefined();
  });

  it("draws admin's More under Sales, Production, Setup and Menu, with one Settings entry (#1513)", () => {
    expect(drawn(moreFor(["admin"]))).toEqual([
      ["Sales", ["Invoices", "Catalog", "Customers", "Price groups", "Compliance"]],
      ["Production", ["Recipes", "Vendors", "Planning"]],
      ["Setup", ["Settings"]],
      ["Menu", ["Menu"]],
    ]);
  });

  it("drops an area the role has no entry under", () => {
    expect(drawn(moreFor(["brewer"]))).toEqual([["Production", ["Recipes", "Vendors", "Planning"]]]);
    expect(drawn(moreFor(["warehouse"]))).toEqual([["Production", ["Vendors", "Planning"]], ["Menu", ["Menu"]]]);
  });

  it("keeps a tab's ungrouped children together under no heading", () => {
    const beer = STAFF_NAV.find(t => t.label === "Beer")!;
    expect(navGroups(beer.children!)).toEqual([{ group: undefined, items: beer.children }]);
  });
});

describe("UNLISTED_NAV (#1513)", () => {
  it("keeps the pages Settings and Me link, out of the rail and More", () => {
    expect(UNLISTED_NAV.map(i => i.label)).toEqual(["Import", "Sale channels", "Locations", "Chat"]);
    const drawnHrefs = STAFF_NAV.flatMap(t => [t.href, ...(t.children ?? []).map(c => c.href)]);
    for (const item of UNLISTED_NAV) expect.soft(drawnHrefs, item.label).not.toContain(item.href);
  });
  it("Search still finds them for a role that may open them", () => {
    expect(searchDestinations(["admin"], "locat").map(i => i.label)).toEqual(["Locations"]);
    expect(searchDestinations(["taproom"], "chat").map(i => i.label)).toEqual(["Chat"]);
    expect(searchDestinations(["sales"], "locat")).toEqual([]);
  });
});
