// tests/nav-page-roles.test.ts — a rail link a role can see must open. Each
// production page is a server component that runs several registry queries
// before it renders; if one of them refuses the role, the page throws to the
// error boundary instead of drawing (final review 2026-09-07, finding 1: the
// brewer-only Recipes/Batches/Cellar/Packaging links hit catalog and inventory
// reads that admitted only admin/sales/warehouse). The page → queries map below
// is written by hand from the page sources so a page that gains a read has to
// come back here.
import { describe, expect, it } from "vitest";
import "../lib/commands/all";
import { getCommandDefinition, type StaffRole } from "../lib/commands/registry";
import { STAFF_NAV, type NavItem } from "../lib/mgr/nav";

/** href → every registry operation the page (and its detail page) calls. */
const PAGE_QUERIES: Record<string, readonly string[]> = {
  "/recipes": ["list_recipes", "list_brands", "get_recipe", "list_materials", "get_gravity_unit"],
  "/batches": ["list_batches", "list_brands", "list_recipes", "list_vessels", "get_brew_day"],
  "/cellar": ["list_occupancies", "list_vessels", "get_gravity_unit"],
  "/packaging": [
    "list_packaging_runs", "list_brands", "list_occupancies", "list_locations", "list_bins", "list_skus",
    "get_packaging_run",
  ],
  "/settings/units": ["get_gravity_unit"],
  "/materials": ["list_materials", "get_material_on_hand", "list_vendors_and_contracts", "list_locations", "list_bins"],
  "/vendors": ["list_vendors_and_contracts", "list_materials"],
  "/purchase-orders": ["list_purchase_orders", "list_vendors_and_contracts", "list_materials", "get_purchase_order", "list_locations", "list_bins"],
  "/planning": ["get_material_requirements"],
};

const flatten = (items: readonly NavItem[]): NavItem[] => items.flatMap((i) => [i, ...(i.children ?? [])]);
const entry = (href: string) => flatten(STAFF_NAV).find((i) => i.href === href);

describe("production pages open for every role the rail offers them to", () => {
  for (const [href, queries] of Object.entries(PAGE_QUERIES)) {
    it(`${href}`, () => {
      const item = entry(href);
      expect(item, `${href} is missing from STAFF_NAV`).toBeDefined();
      // Omitted roles means every role; admin always sees everything.
      const roles = (item!.roles ?? (["admin", "sales", "warehouse", "brewer"] as const)) as readonly StaffRole[];
      for (const role of [...roles, "admin" as const]) {
        for (const name of queries) {
          const def = getCommandDefinition(name);
          expect(def, `${name} is not registered`).toBeDefined();
          expect.soft(def!.roles, `${href} as ${role}: ${name}`).toContain(role);
        }
      }
    });
  }
});
