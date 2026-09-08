// app/(app)/more/page.tsx — More: setup and desk review, never standing work.
// The rows are the role's More entries from the navigation manifest
// (lib/mgr/nav.ts), so a hidden entry leaves no gap and a planned one never
// appears; the phone More tab lands here instead of on the first child.
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { navFor, shippedNav, STAFF_NAV } from "@/lib/mgr/nav";

const ABOUT: Record<string, string> = {
  Invoices: "QuickBooks Online mapping and push", Catalog: "brands and SKUs", "Price groups": "rows of the price grid", Customers: "accounts and ship-tos",
  Recipes: "formulas and versions", Compliance: "reports and filing status", Vendors: "suppliers", "Sale channels": "tax treatment",
  Settings: "brewery and integrations", Locations: "warehouses, taprooms and bins", Units: "gravity display",
};

export default async function MorePage() {
  const brewery = await getActiveBrewery();
  const items = navFor(shippedNav(STAFF_NAV), brewery.role).find((t) => t.label === "More")?.children ?? [];
  return (
    <>
      {E.hd("More")}
      {items.map((c) => <Link key={c.href} href={c.href} className="block">{E.nav(c.label, ABOUT[c.label] ?? "")}</Link>)}
    </>
  );
}
