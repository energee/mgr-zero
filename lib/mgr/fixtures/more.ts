// lib/mgr/fixtures/more.ts — More landing navs for the inventory drawing.
import type { MoreNavView } from "@/lib/mgr/more-view";

export const moreNavs: MoreNavView[] = [
  { key: "invoices", title: "Invoices", detail: "QuickBooks Online mapping and push", mark: "qbo" },
  { key: "catalog", title: "Catalog", detail: "brands and SKUs" },
  { key: "prices", title: "Price groups", detail: "rows of the price grid" },
  { key: "customers", title: "Customers", detail: "accounts and ship-tos" },
  { key: "recipes", title: "Recipes", detail: "formulas and versions" },
  { key: "compliance", title: "Compliance months", detail: "reports and filing status" },
  { key: "vendors", title: "Vendors", detail: "suppliers" },
  { key: "channels", title: "Sale channels", detail: "tax treatment" },
  { key: "formats", title: "Formats", detail: "package composition" },
  { key: "planning", title: "Planning" },
  { key: "settings", title: "Settings", detail: "brewery and integrations" },
  { key: "locations", title: "Locations", detail: "warehouses, taprooms and bins" },
  { key: "bins", title: "Bins", detail: "physical subdivisions by location" },
  { key: "chat", title: "Chat", detail: "Slack and notifications" },
];
