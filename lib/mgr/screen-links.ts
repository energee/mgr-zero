// lib/mgr/screen-links.ts — the explorer's tap resolver: which screen a tap
// inside a drawn screen opens. Screens are static drawings, so the label is
// the link: a record's own `to` map wins, then the global rules here (labels
// and shell routes that always mean one screen), then an exact screen-name
// match — which already covers every back arrow, tab and "New order" style
// verb. Unresolved taps do nothing. Pure, so tests/screen-links.test.ts can
// walk the main flows without a DOM.
import { SCREENS, type Screen } from "@/components/mgr/screens";

/** Labels (or label patterns) that mean one screen wherever they appear. */
export const TAPS: [string | RegExp, string][] = [
  [/^ORD-\d+/, "Order"],
  [/^INV-\d+/, "Invoice"],
  [/^PO-\d+/, "Receive PO"],
  [/^(Hazy IPA|Pils|Stout) · /, "SKU detail"],
  [/^Review order\b/, "Review order"],
  [/^Place order\b/, "Order detail"],
  [/^Same as last week$/, "Review order"],
  ["Confirm", "Confirm order"],
  ["Confirm order", "Order"],
  ["Save draft", "Order"],
  ["Save customer", "Customer detail"],
  ["Save ship-to", "Customer detail"],
  ["Save SKU", "SKU detail"],
  ["Ship order", "Ship and invoice"],
  ["Ship", "Ship and invoice"],
  ["Pick", "Pick sheet"],
  ["Finish", "Ship and invoice"],
  ["Receive", "Receive PO"],
  ["Invite", "Invite portal user"],
  ["Resume", "Driver route"],
  ["Review", "SKU detail"],
  ["Reorder", "Shop"],
  ["Edit prices", "Price lists"],
  ["Sign out", "Sign in"],
  ["Sign in", "Today"],
  ["Email me a link", "Reset password"],
  ["Send reset link", "Set new password"],
  ["Save password", "Sign in"],
  ["Search", "Search"],
  ["Me", "Me"],
  ["Ridgeline Tap Room", "Customer detail"],
];

/** Shell links by route (lib/mgr/nav.ts): the tab bar, the rail and its children. */
export const ROUTES: Record<string, string> = {
  "/": "Today",
  "/inventory": "Finished goods",
  "/inventory#taproom": "Taproom",
  "/inventory#taps": "Tap board",
  "/inventory#cellar": "Cellar map",
  "/inventory#materials": "Materials on hand",
  "/inventory#kegs": "Keg fleet",
  "/orders": "Orders",
  "/pick": "Pick sheet",
  "/replenishment": "Pars and allocation",
  "/orders#batches": "Batches",
  "/orders#packaging": "Packaging runs",
  "/orders#purchase-orders": "Purchase orders",
  "/orders#deliveries": "Routes",
  "/invoices": "Invoices",
  "/catalog": "Catalog",
  "/customers": "Customers",
  "/pricing": "Price lists",
  "/catalog#recipes": "Recipes",
  "/invoices#compliance": "Compliance months",
  "/orders#planning": "Planning",
  "/settings/team#import": "Import",
  "/settings/team": "Team",
  "/portal": "Shop",
  "/portal/orders": "Order history",
  "/portal/invoices": "Invoice history",
  "/portal/account": "Account",
};

const NAMES = new Set(SCREENS.filter((s) => !s.venue).map((s) => s.name));

/** `to` is an explicit target on the element (E.link's data-to) and wins outright. */
export function resolveTap(screen: Screen, label: string, href?: string | null, to?: string | null): string | undefined {
  if (to) return to;
  const l = label.trim();
  if (screen.to?.[l]) return screen.to[l];
  if (href && ROUTES[href]) return ROUTES[href];
  for (const [k, name] of TAPS) if (typeof k === "string" ? k === l : k.test(l)) return name;
  return NAMES.has(l) ? l : undefined;
}
