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
  { label: "Beer", href: "/inventory", children: [{ label: "Inventory", href: "/inventory" }] },
  {
    label: "Work",
    href: "/orders",
    children: [
      { label: "Orders", href: "/orders" },
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

/** Drop entries the role may not see. Tabs stay; only their children thin out. */
export function navFor(items: readonly NavItem[], role: StaffRole): NavItem[] {
  return items
    .filter((i) => allowed(i, role))
    .map((i) => (i.children ? { ...i, children: i.children.filter((c) => allowed(c, role)) } : i));
}

/** The tab whose href (or a child's) is the longest prefix of the path. */
export function activeTab(items: readonly NavItem[], pathname: string): NavItem | undefined {
  const matches = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
  let best: { tab: NavItem; len: number } | undefined;
  for (const tab of items) {
    for (const href of [tab.href, ...(tab.children ?? []).map((c) => c.href)]) {
      if (matches(href) && (!best || href.length > best.len)) best = { tab, len: href.length };
    }
  }
  return best?.tab;
}
