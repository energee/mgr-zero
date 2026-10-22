// lib/mgr/fixtures/more.ts — More landing navs for the inventory drawing. A
// card that is also a More entry in lib/mgr/nav.ts carries that entry's
// `about` line, as the live page does (tests/shell-view.test.ts checks it).
import type { MoreNavView } from "@/lib/mgr/more-view";

export const moreNavs: MoreNavView[] = [
  { key: "invoices", title: "Invoices", detail: "See what customers owe and open an invoice", mark: "qbo" },
  { key: "catalog", title: "Catalog", detail: "Define brands, formats and SKUs" },
  { key: "prices", title: "Price groups", detail: "Set prices by group for each sale channel" },
  { key: "customers", title: "Customers", detail: "Manage accounts, ship-tos and portal users" },
  { key: "recipes", title: "Recipes", detail: "Write recipes and their versions" },
  { key: "compliance", title: "Compliance", detail: "Review and file compliance reports" },
  { key: "vendors", title: "Vendors", detail: "Manage suppliers and their terms" },
  { key: "channels", title: "Sale channels", detail: "Name how you sell and how each is taxed" },
  { key: "formats", title: "Formats", detail: "Define package formats and their volumes" },
  { key: "planning", title: "Planning", detail: "See material gaps and draft purchase orders" },
  { key: "settings", title: "Settings", detail: "Edit brewery details and connect integrations" },
  { key: "locations", title: "Locations", detail: "Manage warehouses, taprooms and their bins" },
  { key: "bins", title: "Bins", detail: "Subdivide a location into bins" },
  { key: "chat", title: "Chat", detail: "Connect Slack and set your notifications" },
];
