// lib/mgr/fixtures/more.ts — More landing navs for the inventory drawing. A
// card that is also a More entry in lib/mgr/nav.ts quotes that entry's
// `about` line through navAbout, as the live page prints it.
import type { MoreNavView } from "@/lib/mgr/more-view";
import { navAbout } from "@/lib/mgr/nav";

export const moreNavs: MoreNavView[] = [
  { key: "invoices", title: "Invoices", detail: navAbout("Invoices"), mark: "qbo" },
  { key: "catalog", title: "Catalog", detail: navAbout("Catalog") },
  { key: "prices", title: "Price groups", detail: navAbout("Price groups") },
  { key: "customers", title: "Customers", detail: navAbout("Customers") },
  { key: "recipes", title: "Recipes", detail: navAbout("Recipes") },
  { key: "compliance", title: "Compliance", detail: navAbout("Compliance") },
  { key: "vendors", title: "Vendors", detail: navAbout("Vendors") },
  { key: "channels", title: "Sale channels", detail: navAbout("Sale channels") },
  { key: "formats", title: "Formats", detail: "Define package formats and their volumes" },
  { key: "planning", title: "Planning", detail: navAbout("Planning") },
  { key: "settings", title: "Settings", detail: navAbout("Settings") },
  { key: "locations", title: "Locations", detail: navAbout("Locations") },
  { key: "bins", title: "Bins", detail: "Subdivide a location into bins" },
  { key: "chat", title: "Chat", detail: navAbout("Chat") },
];
