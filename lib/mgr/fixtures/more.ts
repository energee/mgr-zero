// lib/mgr/fixtures/more.ts — More landing navs for the inventory drawing. A
// card that is also a More entry in lib/mgr/nav.ts quotes that entry's
// `about` line through navAbout and files under that entry's area, as the live
// page does. Formats and Bins are not nav entries, so they name their own.
import type { MoreNavView } from "@/lib/mgr/more-view";
import { navAbout, STAFF_NAV } from "@/lib/mgr/nav";

const moreEntries = STAFF_NAV.find((t) => t.label === "More")!.children!;

/** The card for the More entry labelled `title`, as the live page draws it. */
const entry = (key: string, title: string, mark?: MoreNavView["mark"]): MoreNavView =>
  ({ key, title, detail: navAbout(title), group: moreEntries.find((c) => c.label === title)!.group, mark });

export const moreNavs: MoreNavView[] = [
  entry("invoices", "Invoices", "qbo"),
  entry("catalog", "Catalog"),
  entry("prices", "Price groups"),
  entry("customers", "Customers"),
  entry("recipes", "Recipes"),
  entry("compliance", "Compliance"),
  entry("vendors", "Vendors"),
  entry("channels", "Sale channels"),
  { key: "formats", title: "Formats", detail: "Define package formats and their volumes", group: "Sales" },
  entry("planning", "Planning"),
  entry("settings", "Settings"),
  entry("locations", "Locations"),
  { key: "bins", title: "Bins", detail: "Subdivide a location into bins", group: "Setup" },
  entry("chat", "Chat"),
];
