// lib/mgr/nav.ts — the navigation manifests both shells consume (plan §3):
// the four staff tabs with their desktop-rail children, the portal's tabs,
// and the two pure helpers AppShell needs — role filtering (a hidden entry
// leaves no gap) and active-tab resolution. Only routes that exist today are
// listed; the plan's fuller rail grows here as pages ship.
import type { StaffRole } from "@/lib/commands/registry";

export type NavItem = {
  label: string;
  href: string;
  /** Omitted = every role. Admin always sees everything. */
  roles?: readonly StaffRole[];
  /** Desktop rail sub-entries; the tab itself is the phone target. */
  children?: readonly NavItem[];
};

export const STAFF_NAV: readonly NavItem[] = [
  { label: "Today", href: "/" },
  // Inventory and Orders reads exclude brewer today (lib/commands/*.ts readRoles); the
  // brewer's Cellar/Brew day/Packaging areas arrive with their slices.
  { label: "Beer", href: "/inventory", children: [{ label: "Inventory", href: "/inventory", roles: ["sales", "warehouse"] }] },
  {
    label: "Work",
    href: "/orders",
    children: [
      { label: "Orders", href: "/orders", roles: ["sales", "warehouse"] },
      { label: "Pick", href: "/pick", roles: ["warehouse"] },
      { label: "Replenishment", href: "/replenishment", roles: ["warehouse"] },
    ],
  },
  {
    label: "More",
    href: "/invoices",
    children: [
      { label: "Invoices", href: "/invoices", roles: ["sales"] },
      { label: "Catalog", href: "/catalog", roles: ["sales"] },
      { label: "Customers", href: "/customers", roles: ["sales"] },
      { label: "Price lists", href: "/pricing", roles: ["sales"] },
      { label: "Settings", href: "/settings/team", roles: ["admin"] },
    ],
  },
];

export const PORTAL_NAV: readonly NavItem[] = [
  { label: "Order", href: "/portal" },
  { label: "Orders", href: "/portal/orders" },
  { label: "Invoices", href: "/portal/invoices" },
];

const allowed = (item: NavItem, role: StaffRole) => role === "admin" || !item.roles || item.roles.includes(role);

/**
 * Drop entries the role may not see. Children thin out; a group whose
 * children all fall away is dropped too, since its href is one of the routes
 * just hidden (a warehouse user must not get a bare "More" tab that opens
 * Invoices).
 */
export function navFor(items: readonly NavItem[], role: StaffRole): NavItem[] {
  return items
    .filter((i) => allowed(i, role))
    .map((i) => (i.children ? { ...i, children: i.children.filter((c) => allowed(c, role)) } : i))
    .filter((i) => !i.children || i.children.length > 0);
}

/** True when `pathname` is `href` or a route beneath it ("/" only matches itself). */
export const isUnder = (pathname: string, href: string) =>
  pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

/** The tab whose href (or a child's) is the longest prefix of the path. */
export function activeTab(items: readonly NavItem[], pathname: string): NavItem | undefined {
  let best: { tab: NavItem; len: number } | undefined;
  for (const tab of items) {
    for (const href of [tab.href, ...(tab.children ?? []).map((c) => c.href)]) {
      if (isUnder(pathname, href) && (!best || href.length > best.len)) best = { tab, len: href.length };
    }
  }
  return best?.tab;
}
