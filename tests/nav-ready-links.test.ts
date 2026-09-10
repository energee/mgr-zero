// tests/nav-ready-links.test.ts — the rail never points at a fragment that no
// page renders (rendered-ux-perf audit 2026-09-05 #4: 14 anchors landed on the
// page top with no active highlight). Entries whose target is not built yet
// stay in the manifest as `planned` so the docs and the screen inventory keep
// the groups, and shippedNav() hides them from the real app's rail and tabs.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { navFor, shippedNav, STAFF_NAV, type NavItem } from "../lib/mgr/nav";

const ROLES = ["admin", "sales", "warehouse", "brewer"] as const;

/** Every page.tsx under app/(app), concatenated — the static id check reads these. */
function pageSources(dir = join(__dirname, "..", "app", "(app)")): string {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return [pageSources(p)];
    return name === "page.tsx" ? [readFileSync(p, "utf8")] : [];
  }).join("\n");
}

const flatten = (items: readonly NavItem[]): NavItem[] => items.flatMap((i) => [i, ...(i.children ?? [])]);

describe("shippedNav", () => {
  const sources = pageSources();

  it("renders only links whose fragment exists in the target page source", () => {
    for (const role of ROLES) {
      for (const item of flatten(navFor(shippedNav(STAFF_NAV), role))) {
        const hash = item.href.split("#")[1];
        if (hash) expect.soft(sources, `${role}: ${item.label} -> ${item.href}`).toContain(`id="${hash}"`);
      }
    }
  });

  it("keeps the planned entries in the manifest for the docs and the inventory", () => {
    const all = flatten(STAFF_NAV).map((i) => i.label);
    for (const label of ["Taproom", "Taps", "Cellar", "Materials", "Kegs", "Batches", "Packaging", "Purchase orders", "Deliveries", "Menu", "Recipes", "Compliance", "Planning", "Import"]) {
      expect.soft(all).toContain(label);
    }
  });

  it("drops a group whose every child is planned or hidden from the role", () => {
    expect(navFor(shippedNav(STAFF_NAV), "brewer").map((t) => t.label)).toEqual(["Today", "Beer", "Work", "More"]);
    // Warehouse now keeps More: Units is a personal display preference every
    // staff role may set (set_my_gravity_unit admits all four), so it is the
    // one child of that group warehouse can see. The group's own href
    // (/invoices) stays openable for warehouse — list_invoices admits it — so
    // the phone tab still lands somewhere real.
    expect(navFor(shippedNav(STAFF_NAV), "warehouse").map((t) => t.label)).toEqual(["Today", "Beer", "Work", "More"]);
    expect(navFor(shippedNav(STAFF_NAV), "warehouse").find((t) => t.label === "More")!.children!.map((c) => c.label))
      .toEqual(["Vendors", "Planning", "Chat", "Units"]);
    expect(navFor(shippedNav(STAFF_NAV), "admin").find((t) => t.label === "More")!.children!.map((c) => c.label))
      .toEqual(["Invoices", "Catalog", "Customers", "Price groups", "Recipes", "Vendors", "Compliance", "Planning", "Import", "Settings", "Chat", "Sale channels", "Locations", "Units"]);
  });
});
