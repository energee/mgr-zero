// lib/mgr/nav.ts — the navigation manifests both shells consume (plan §3):
// the four staff tabs with their desktop-rail children, the portal's tabs,
// and the pure helpers AppShell needs — role filtering (a hidden entry
// leaves no gap), shipped filtering, area grouping, and active tab/child
// resolution — plus navTitle, which names each staff page's browser tab. Planned
// subareas (Taproom, Batches, Menu, …) are listed with `planned: true` and an
// anchor on the parent route they will one day belong to, so the docs and the
// screen inventory (components/mgr/screen-frame.tsx) still know the groups;
// the real app's shell passes the manifest through shippedNav() first, so the
// rail never renders a link whose target does not exist yet
// (tests/nav-ready-links.test.ts checks every rendered fragment against the
// page sources). Flip `planned` off when the area's route or section ships.
import {
  BeerIcon, Home01Icon, Invoice01Icon, Package01Icon, Settings01Icon, ShoppingCart01Icon, UserCircleIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@/components/mgr/icon";
import type { StaffRole } from "@/lib/commands/registry";
import { hasAnyRole } from "./roles";

/** The areas More's entries are filed under, in the order they are drawn
 * (#1159). The More page and the rail's More group both head each area. */
const NAV_GROUPS = ["Sales", "Production", "Setup", "Integrations"] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export type NavItem = {
  label: string;
  href: string;
  /** Omitted = every role. Admin always sees everything. */
  roles?: readonly StaffRole[];
  /** One sentence-case line of what you do there, without a trailing period,
   * accurate for every role that can open the entry.
   * The More landing prints it under the card, Search under a Pages match,
   * and Settings quotes it through navAbout; tests/mgr-nav.test.ts requires
   * it on every staff entry. */
  about?: string;
  /** The area heading this child sits under; tests/mgr-nav.test.ts requires
   * it on every More child. Beer and Work children have none. */
  group?: NavGroup;
  /** Not built yet: shown in the design inventory, hidden by shippedNav(). */
  planned?: true;
  /** Desktop rail sub-entries; the tab itself is the phone target. */
  children?: readonly NavItem[];
  /** Tab glyph — phone tab bar and rail group head only, never a child
   * (docs/plans/hugeicons.md §1). */
  icon?: IconSvgElement;
};

export const STAFF_NAV: readonly NavItem[] = [
  { label: "Today", href: "/", icon: Home01Icon, about: "See the work waiting on you" },
  {
    label: "Beer",
    href: "/beer",
    icon: BeerIcon,
    about: "See beer and supplies on hand",
    children: [
      { label: "Inventory", href: "/inventory", roles: ["sales", "warehouse"], about: "See finished goods on hand and available" },
      { label: "Taproom", href: "/taproom", roles: ["warehouse", "taproom"], about: "Record the weekly taproom count" },
      { label: "Taps", href: "/taproom/board", roles: ["warehouse", "taproom"], about: "See what is pouring and swap kegs" },
      { label: "Variance by brand", href: "/taproom/variance", roles: ["warehouse", "taproom"], about: "Compare what sold with what was counted" },
      { label: "Cellar", href: "/cellar", roles: ["brewer"], about: "Track tanks, readings and additions" },
      { label: "Materials", href: "/materials", roles: ["brewer", "warehouse"], about: "Count ingredients and packaging on hand" },
      { label: "Kegs", href: "/kegs", roles: ["warehouse"], about: "Track keg pools, events and customer balances" },
    ],
  },
  {
    label: "Work",
    href: "/work",
    icon: Package01Icon,
    about: "See everything in motion, by next due date",
    children: [
      { label: "Orders", href: "/orders", roles: ["sales", "warehouse"], about: "Find orders and take the next step" },
      { label: "Pick", href: "/pick", roles: ["warehouse"], about: "Pick confirmed orders by ship date" },
      { label: "Replenishment", href: "/replenishment", roles: ["sales", "warehouse"], about: "Keep taprooms stocked to their pars" },
      { label: "Transfers", href: "/transfers", roles: ["warehouse"], about: "Move stock between locations" },
      { label: "Batches", href: "/batches", roles: ["brewer"], about: "Schedule and brew batches" },
      { label: "Packaging", href: "/packaging", roles: ["brewer", "warehouse"], about: "Schedule and close packaging runs" },
      { label: "Purchase orders", href: "/purchase-orders", roles: ["warehouse"], about: "Order from vendors and receive what arrives" },
      { label: "Deliveries", href: "/routes", roles: ["warehouse"], about: "Build and run delivery routes" },
    ],
  },
  {
    label: "More",
    href: "/more",
    icon: Settings01Icon,
    about: "Open setup and office pages",
    children: [
      { label: "Invoices", href: "/invoices", roles: ["sales"], group: "Sales", about: "See what customers owe and open an invoice" },
      { label: "Catalog", href: "/catalog", roles: ["sales"], group: "Sales", about: "Define brands, formats and SKUs" },
      { label: "Menu", href: "/menu", roles: ["warehouse"], group: "Integrations", about: "Choose what Square sells, where and for how much" },
      { label: "Customers", href: "/customers", roles: ["sales"], group: "Sales", about: "Manage accounts, ship-tos and portal users" },
      { label: "Price groups", href: "/pricing", roles: ["sales"], group: "Sales", about: "Set prices by group for each sale channel" },
      { label: "Recipes", href: "/recipes", roles: ["brewer"], group: "Production", about: "Write recipes and their versions" },
      { label: "Vendors", href: "/vendors", roles: ["brewer", "warehouse"], group: "Production", about: "Manage vendors, their terms and contracts" },
      { label: "Compliance", href: "/compliance", roles: ["sales"], group: "Sales", about: "Review and file compliance reports" },
      { label: "Planning", href: "/planning", roles: ["brewer", "warehouse"], group: "Production", about: "See what planned work is short of" },
      { label: "Import", href: "/settings/import", roles: ["admin"], group: "Setup", about: "Bring in customers, ship-tos, SKUs, prices and opening stock from CSV" },
      { label: "Settings", href: "/settings", roles: ["admin"], group: "Setup", about: "Edit brewery details and connect integrations" },
      { label: "Chat", href: "/settings/chat", group: "Integrations", about: "Link Slack and set your notifications" },
      { label: "Sale channels", href: "/settings/channels", roles: ["admin"], group: "Setup", about: "Name how you sell and how each is taxed" },
      { label: "Locations", href: "/locations", roles: ["admin"], group: "Setup", about: "Manage warehouses, taprooms and their bins" },
      { label: "Units", href: "/settings/units", group: "Setup", about: "Choose how gravity is shown" },
    ],
  },
];

export const PORTAL_NAV: readonly NavItem[] = [
  { label: "Order", href: "/portal", icon: ShoppingCart01Icon },
  { label: "Orders", href: "/portal/orders", icon: Package01Icon },
  { label: "Invoices", href: "/portal/invoices", icon: Invoice01Icon },
  { label: "Account", href: "/portal/account", icon: UserCircleIcon },
];

const allowed = (item: NavItem, roles: readonly StaffRole[]) => hasAnyRole(roles, ["admin"]) || !item.roles || hasAnyRole(roles, item.roles);

/**
 * Drop entries the role may not see. Children thin out, and a group whose
 * children all fall away is dropped with them. A group that keeps at least one
 * child keeps its own href too, so a phone tab can still land on the group
 * route (warehouse More opens Invoices, which warehouse may read).
 */
export function navFor(items: readonly NavItem[], roles: readonly StaffRole[]): NavItem[] {
  return items
    .filter((i) => allowed(i, roles))
    .map((i) => (i.children ? { ...i, children: i.children.filter((c) => allowed(c, roles)) } : i))
    .filter((i) => !i.children || i.children.length > 0);
}

/**
 * Drop entries flagged `planned`, and any group left with no children. The app
 * shell (app/(app)/layout.tsx) applies this before navFor; the screen
 * inventory skips it so the planned frames stay reachable from its rail.
 */
export function shippedNav(items: readonly NavItem[]): NavItem[] {
  return items
    .filter((i) => !i.planned)
    .map((i) => (i.children ? { ...i, children: i.children.filter((c) => !c.planned) } : i))
    .filter((i) => !i.children || i.children.length > 0);
}

/**
 * Split a tab's children under their area headings, in NAV_GROUPS order, each
 * keeping its order within the area. Children with no area come first under
 * no heading (Beer, Work). Pass role-filtered children: an area left with no
 * child is dropped, so its heading is never drawn empty.
 */
export function navGroups<T extends { group?: NavGroup }>(items: readonly T[]): { group?: NavGroup; items: T[] }[] {
  return [undefined, ...NAV_GROUPS]
    .map((group) => ({ group, items: items.filter((i) => i.group === group) }))
    .filter((g) => g.items.length > 0);
}

/** Every STAFF_NAV entry, groups and their children alike. */
const STAFF_ENTRIES = STAFF_NAV.flatMap((i) => [i, ...(i.children ?? [])]);

/**
 * The `about` line of the STAFF_NAV entry labelled `label`, so a surface that
 * describes the same page (a Settings row, an inventory fixture) quotes it
 * instead of keeping its own copy. Throws for a label with no line, so a
 * renamed entry fails loudly rather than drawing a blank description.
 */
export function navAbout(label: string): string {
  const about = STAFF_ENTRIES.find((i) => i.label === label)?.about;
  if (!about) throw new Error(`STAFF_NAV has no about line for ${label}`);
  return about;
}

/** True when `pathname` is `href` or a route beneath it ("/" only matches itself). */
export const isUnder = (pathname: string, href: string) =>
  pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

/** The candidate whose href is the longest prefix of `pathname`. */
function longestMatch<T>(pathname: string, candidates: readonly (readonly [T, string])[]): T | undefined {
  let best: { item: T; len: number } | undefined;
  for (const [item, href] of candidates) {
    if (isUnder(pathname, href) && (!best || href.length > best.len)) best = { item, len: href.length };
  }
  return best?.item;
}

/** The deepest STAFF_NAV entry whose href covers `path`, if any. */
const coveringEntry = (path: string) => longestMatch(path, STAFF_ENTRIES.map((i) => [i, i.href] as const));

/**
 * Whether `role` may open `path`, by the gate of the deepest STAFF_NAV entry
 * whose href covers it: /settings/units follows Units (every role), while
 * /settings/pos has no entry of its own and follows Settings (admin). A path
 * no entry covers has no nav gate and counts as open. Back links use this so
 * they never point a role at a page that sends it to No access (#444).
 */
export function canOpen(roles: readonly StaffRole[], path: string): boolean {
  const best = coveringEntry(path);
  return !best || allowed(best, roles);
}

/**
 * The browser-tab title of the staff page at `path` (#1109): the label of the
 * deepest STAFF_NAV entry covering it. /routes reads "Deliveries";
 * /settings/team has no entry and follows Settings. Each static page exports
 * `metadata = { title: navTitle("<its route>") }`, and the root layout's
 * template appends " · MGR". Throws for a path no STAFF_NAV entry covers, so
 * a page outside the nav fails at build. tests/page-titles.test.ts catches a
 * page that passes a route other than its own, such as a moved page.
 */
export function navTitle(path: string): string {
  const entry = coveringEntry(path);
  if (!entry) throw new Error(`No STAFF_NAV entry covers ${path}`);
  return entry.label;
}

/** The tab whose href (or a child's) is the longest prefix of the path. */
export function activeTab(items: readonly NavItem[], pathname: string): NavItem | undefined {
  return longestMatch(pathname, items.flatMap((tab) =>
    [tab.href, ...(tab.children ?? []).map((c) => c.href)].map((href) => [tab, href] as const)));
}

/**
 * The one child of `tab` to highlight: the longest href prefix of the path, so
 * /taproom/board lights Taps and not Taproom too, and /settings/units lights
 * Units and not Settings.
 */
export function activeChild(tab: NavItem, pathname: string): NavItem | undefined {
  return longestMatch(pathname, (tab.children ?? []).map((c) => [c, c.href] as const));
}
