// lib/mgr/nav.ts — the navigation manifests both shells consume (plan §3):
// the four staff tabs with their desktop-rail children, the portal's tabs,
// and the two pure helpers AppShell needs — role filtering (a hidden entry
// leaves no gap) and active-tab resolution. Only routes that exist today are
// listed; planned subareas use anchors on their existing parent route until
// their dedicated route ships, so the rail never points at a 404.
import {
  BeerIcon, Home01Icon, Invoice01Icon, Package01Icon, Settings01Icon, ShoppingCart01Icon, UserCircleIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@/components/mgr/icon";
import type { StaffRole } from "@/lib/commands/registry";

export type NavItem = {
  label: string;
  href: string;
  /** Omitted = every role. Admin always sees everything. */
  roles?: readonly StaffRole[];
  /** Desktop rail sub-entries; the tab itself is the phone target. */
  children?: readonly NavItem[];
  /** Tab glyph — phone tab bar and rail group head only, never a child
   * (docs/plans/hugeicons.md §1). */
  icon?: IconSvgElement;
};

export const STAFF_NAV: readonly NavItem[] = [
  { label: "Today", href: "/", icon: Home01Icon },
  {
    label: "Beer",
    href: "/inventory",
    icon: BeerIcon,
    children: [
      { label: "Inventory", href: "/inventory", roles: ["sales", "warehouse"] },
      { label: "Taproom", href: "/inventory#taproom", roles: ["warehouse"] },
      { label: "Taps", href: "/inventory#taps", roles: ["warehouse"] },
      { label: "Cellar", href: "/inventory#cellar", roles: ["brewer"] },
      { label: "Materials", href: "/inventory#materials", roles: ["brewer", "warehouse"] },
      { label: "Kegs", href: "/inventory#kegs", roles: ["warehouse"] },
    ],
  },
  {
    label: "Work",
    href: "/orders",
    icon: Package01Icon,
    children: [
      { label: "Orders", href: "/orders", roles: ["sales", "warehouse"] },
      { label: "Pick", href: "/pick", roles: ["warehouse"] },
      { label: "Replenishment", href: "/replenishment", roles: ["sales", "warehouse"] },
      { label: "Batches", href: "/orders#batches", roles: ["brewer"] },
      { label: "Packaging", href: "/orders#packaging", roles: ["brewer", "warehouse"] },
      { label: "POs", href: "/orders#purchase-orders", roles: ["warehouse"] },
      { label: "Deliveries", href: "/orders#deliveries", roles: ["warehouse"] },
    ],
  },
  {
    label: "More",
    href: "/invoices",
    icon: Settings01Icon,
    children: [
      { label: "Invoices", href: "/invoices", roles: ["sales"] },
      { label: "Catalog", href: "/catalog", roles: ["sales"] },
      { label: "Menu", href: "/catalog#menu", roles: ["warehouse"] },
      { label: "Customers", href: "/customers", roles: ["sales"] },
      { label: "Price lists", href: "/pricing", roles: ["sales"] },
      { label: "Recipes", href: "/catalog#recipes", roles: ["brewer"] },
      { label: "Compliance", href: "/invoices#compliance", roles: ["sales"] },
      { label: "Planning", href: "/orders#planning", roles: ["brewer", "warehouse"] },
      { label: "Import", href: "/settings/team#import", roles: ["admin"] },
      { label: "Settings", href: "/settings/team", roles: ["admin"] },
    ],
  },
];

export const PORTAL_NAV: readonly NavItem[] = [
  { label: "Order", href: "/portal", icon: ShoppingCart01Icon },
  { label: "Orders", href: "/portal/orders", icon: Package01Icon },
  { label: "Invoices", href: "/portal/invoices", icon: Invoice01Icon },
  { label: "Account", href: "/portal/account", icon: UserCircleIcon },
];

const allowed = (item: NavItem, role: StaffRole) => role === "admin" || !item.roles || item.roles.includes(role);

/**
 * Drop entries the role may not see. Children thin out, and a group whose
 * children all fall away is dropped with them. A group that keeps at least one
 * child keeps its own href too, so a phone tab can still land on the group
 * route (warehouse More opens Invoices, which warehouse may read).
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
