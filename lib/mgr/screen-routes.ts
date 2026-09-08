// lib/mgr/screen-routes.ts — which live page draws each ungated MGR screen
// record. tests/app-screen-parity.test.ts fails when the inventory promises a
// screen the app does not have: every name ungatedMgrScreens() returns must map
// here to a page file that exists. Rows are added as pages land; a screen with
// no row is a missing page, not a typo. Files are repo-relative paths under
// app/, so the map doubles as the reader's index from screen to source.
import { SCREENS, type Screen } from "@/components/mgr/screens";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/all";

export const SCREEN_ROUTES: { name: string; file: string }[] = [
  { name: "Today", file: "app/(app)/page.tsx" },
  { name: "First-run checklist", file: "app/(app)/page.tsx" },
  { name: "Beer", file: "app/(app)/beer/page.tsx" },
  { name: "Work", file: "app/(app)/work/page.tsx" },
  { name: "More", file: "app/(app)/more/page.tsx" },
  { name: "Search", file: "app/(app)/search/page.tsx" },
  { name: "Entity picker", file: "components/mgr/search-palette.tsx" },
  { name: "Me", file: "components/mgr/me-sheet.tsx" },
  { name: "Settings", file: "app/(app)/settings/page.tsx" },
  { name: "Team", file: "app/(app)/settings/team/page.tsx" },
  { name: "Permission denied", file: "app/(app)/denied/page.tsx" },
  { name: "No membership", file: "app/(auth)/no-membership/page.tsx" },
  { name: "Session expired", file: "app/(auth)/login/page.tsx" },
  { name: "Reset password", file: "app/(auth)/reset/page.tsx" },
  { name: "Set new password", file: "app/(auth)/password/page.tsx" },
  { name: "Portal sign in", file: "app/(auth)/portal/login/page.tsx" },
  { name: "Portal forgot password", file: "app/(auth)/reset/page.tsx" },
  { name: "Portal set password", file: "app/(auth)/password/page.tsx" },
  { name: "Today empty", file: "app/(app)/page.tsx" },
  { name: "Sales", file: "app/(app)/page.tsx" },
  { name: "Brewer", file: "app/(app)/page.tsx" },
  { name: "Driver", file: "app/(app)/page.tsx" },
  { name: "Taproom", file: "app/(app)/page.tsx" },
  { name: "Locations", file: "app/(app)/locations/page.tsx" },
  { name: "Location detail", file: "app/(app)/locations/[id]/page.tsx" },
  { name: "Location bins", file: "app/(app)/locations/[id]/bins/page.tsx" },
  { name: "Bin", file: "app/(app)/locations/[id]/bins/page.tsx" },
  { name: "Sign in", file: "app/(auth)/login/page.tsx" },
  { name: "Finished goods", file: "app/(app)/inventory/page.tsx" },
  { name: "Record movement", file: "app/(app)/inventory/page.tsx" },
  { name: "Movement recorded", file: "app/(app)/inventory/page.tsx" },
  { name: "Orders", file: "app/(app)/orders/page.tsx" },
  { name: "New order", file: "app/(app)/orders/page.tsx" },
  { name: "Confirm order", file: "app/(app)/orders/[id]/confirm/page.tsx" },
  { name: "Complete transfer", file: "app/(app)/orders/[id]/complete/page.tsx" },
  { name: "Order", file: "app/(app)/orders/[id]/page.tsx" },
  { name: "Adjust lines", file: "app/(app)/orders/[id]/page.tsx" },
  { name: "Short pick", file: "app/(app)/orders/[id]/page.tsx" },
  { name: "Pick", file: "app/(app)/orders/[id]/page.tsx" },
  { name: "Ship and invoice", file: "app/(app)/orders/[id]/page.tsx" },
  { name: "Shipment done", file: "app/(app)/orders/[id]/page.tsx" },
  { name: "Ship on delivery", file: "app/(app)/orders/[id]/page.tsx" },
  { name: "Return and credit", file: "app/(app)/orders/[id]/page.tsx" },
  { name: "Put back", file: "app/(app)/orders/[id]/restock/page.tsx" },
  { name: "Transfers", file: "app/(app)/transfers/page.tsx" },
  { name: "New transfer", file: "app/(app)/transfers/page.tsx" },
  { name: "Transfer detail", file: "app/(app)/transfers/[id]/page.tsx" },
  { name: "Pick sheet", file: "app/(app)/pick/page.tsx" },
  { name: "Pars and allocation", file: "app/(app)/replenishment/page.tsx" },
  { name: "Invoice", file: "app/(app)/invoices/[id]/page.tsx" },
  { name: "Customers", file: "app/(app)/customers/page.tsx" },
  { name: "Customer detail", file: "app/(app)/customers/[id]/page.tsx" },
  { name: "Ship-to form", file: "app/(app)/customers/[id]/page.tsx" },
  { name: "Catalog", file: "app/(app)/catalog/page.tsx" },
  { name: "Brand", file: "app/(app)/catalog/page.tsx" },
  { name: "SKU", file: "app/(app)/catalog/page.tsx" },
  { name: "Formats", file: "app/(app)/catalog/page.tsx" },
  { name: "Format", file: "app/(app)/catalog/page.tsx" },
  { name: "Package BOM", file: "app/(app)/catalog/page.tsx" },
  { name: "SKU list", file: "app/(app)/catalog/page.tsx" },
  { name: "Shop", file: "app/(portal)/portal/page.tsx" },
  { name: "Review order", file: "app/(portal)/portal/page.tsx" },
  { name: "Order history", file: "app/(portal)/portal/orders/page.tsx" },
  { name: "Order detail", file: "app/(portal)/portal/orders/[id]/page.tsx" },
  { name: "Invoice history", file: "app/(portal)/portal/invoices/page.tsx" },
  { name: "Pay invoice", file: "app/(portal)/portal/invoices/[id]/page.tsx" },
  { name: "Question invoice", file: "app/(portal)/portal/invoices/[id]/page.tsx" },
  { name: "Payment unavailable", file: "app/(portal)/portal/invoices/[id]/page.tsx" },
  { name: "Paid invoice", file: "app/(portal)/portal/invoices/[id]/page.tsx" },
  { name: "Account", file: "app/(portal)/portal/account/page.tsx" },
  { name: "Portal Me", file: "components/mgr/me-sheet.tsx" },
  { name: "Vessel detail", file: "app/(app)/cellar/page.tsx" },
  { name: "Batches", file: "app/(app)/batches/page.tsx" },
  { name: "Schedule batch", file: "app/(app)/batches/page.tsx" },
  { name: "Brew day", file: "app/(app)/batches/[id]/page.tsx" },
  { name: "Close packaging run", file: "app/(app)/packaging/[id]/page.tsx" },
  { name: "Run closed", file: "app/(app)/packaging/[id]/page.tsx" },
  { name: "Lot trace", file: "app/(app)/compliance/lots/[id]/page.tsx" },
  { name: "Purchase orders", file: "app/(app)/purchase-orders/page.tsx" },
  { name: "New PO", file: "app/(app)/purchase-orders/page.tsx" },
  { name: "Receive PO", file: "app/(app)/purchase-orders/[id]/page.tsx" },
  { name: "Receipt", file: "app/(app)/purchase-orders/[id]/page.tsx" },
  { name: "Materials on hand", file: "app/(app)/materials/page.tsx" },
  { name: "Cycle count", file: "app/(app)/materials/page.tsx" },
  { name: "Materials", file: "app/(app)/materials/page.tsx" },
  { name: "Material", file: "app/(app)/materials/page.tsx" },
  { name: "Vendors", file: "app/(app)/vendors/page.tsx" },
  { name: "Vendor", file: "app/(app)/vendors/page.tsx" },
  { name: "Contracts", file: "app/(app)/vendors/page.tsx" },
  { name: "Contract", file: "app/(app)/vendors/page.tsx" },
  { name: "Recipes", file: "app/(app)/recipes/page.tsx" },
  { name: "Recipe", file: "app/(app)/recipes/[id]/page.tsx" },
  { name: "Compliance months", file: "app/(app)/compliance/page.tsx" },
  { name: "Compliance registry", file: "app/(app)/compliance/registry/page.tsx" },
  { name: "Brand approval", file: "app/(app)/compliance/registry/page.tsx" },
  { name: "State registration", file: "app/(app)/compliance/registry/page.tsx" },
  { name: "License", file: "app/(app)/compliance/registry/page.tsx" },
  { name: "Keg fleet", file: "app/(app)/kegs/page.tsx" },
  { name: "Customer keg balance", file: "app/(app)/kegs/customers/[customerId]/page.tsx" },
  { name: "Keg event history", file: "app/(app)/kegs/history/page.tsx" },
  { name: "Routes", file: "app/(app)/routes/page.tsx" },
  { name: "Route", file: "app/(app)/routes/[id]/page.tsx" },
  { name: "Return route", file: "app/(app)/routes/[id]/page.tsx" },
  { name: "Driver route", file: "app/(app)/routes/[id]/page.tsx" },
  { name: "Confirm delivery", file: "app/(app)/work/deliveries/[id]/page.tsx" },
  { name: "Sale channels", file: "app/(app)/settings/channels/page.tsx" },
  { name: "Channel", file: "app/(app)/settings/channels/page.tsx" },
  { name: "Units", file: "app/(app)/settings/units/page.tsx" },
  { name: "Price groups", file: "app/(app)/pricing/page.tsx" },
  { name: "Price group", file: "app/(app)/pricing/page.tsx" },
];

/** A gate keeps the token out until the named program lifts it. */
const GATE = /(SCHEMA\/RLS-GATE|SCHEMA-GATE|IMPLEMENTATION-GATE)/;
/** Tokens that are not registry commands: auth platform calls and client state. */
const NOT_A_COMMAND = /\[(platform|client state)/;

/**
 * Every operation a `reads`/`writes` string names, with the tag covering it.
 * The inventory tags a list once at its end ("create_bin · update_bin ·
 * delete_bin [SCHEMA-GATE …]"), so a part inherits the tag of the next tagged
 * part. That inheritance rule is subtle and tests/screen-command-gates.test.ts
 * needs it too, so it is written once here; each caller brings its own
 * predicate for which tags disqualify a name.
 */
export function taggedOperations(text: unknown): { name: string; tag: string }[] {
  if (typeof text !== "string") return [];
  const out: { name: string; tag: string }[] = [];
  let tag = "";
  for (const part of text.split("·").map((p) => p.trim()).reverse()) {
    if (/\[/.test(part)) tag = part.slice(part.indexOf("["));
    const name = part.match(/^([a-z_]+)/)?.[1];
    if (name && name.includes("_")) out.push({ name, tag });
  }
  return out;
}

/** The commands a record names, each with whether the live app can call it. */
const liveCommands = (text: unknown) =>
  taggedOperations(text)
    .filter((t) => !NOT_A_COMMAND.test(t.tag))
    .map((t) => ({ name: t.name, live: !GATE.test(t.tag) && Boolean(getCommandDefinition(t.name)), designed: /\[design/.test(t.tag) }));

/** Whether the live app can draw this record today: another program does not
 * own it outright (`gatedBy`), no read is blocked, and — when the record writes
 * anything — at least one write is live. A read blocks when it is gate-tagged,
 * or unregistered without a `[design]` tag (a `[view]` the page cannot exist
 * without); a `[design]` read another program owns (Invoice's QuickBooks reads)
 * leaves the rest of the page drawable. A screen with mixed live and gated
 * writes (Team, with invite still gated) is in; one whose only writes wait on a
 * gate (Import) is out until it lifts. */
export function isUngated(s: Screen): boolean {
  if (s.venue || s.gatedBy) return false;
  const writes = liveCommands(s.writes);
  const blocked = liveCommands(s.reads).some((t) => !t.live && !t.designed);
  return !blocked && (writes.length === 0 || writes.some((t) => t.live));
}

/** The MGR screens the parity test holds the app to. */
export const ungatedMgrScreens = (): Screen[] => SCREENS.filter(isUngated);
