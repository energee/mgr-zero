import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { NewPoForm } from "../new-po-form";
import "@/lib/commands/all";
import { navTitle } from "@/lib/mgr/nav";
import { breweryDate } from "@/lib/date-format";
import type { PoContract } from "@/lib/mgr/new-po-view";

export const metadata = { title: navTitle("/purchase-orders/new") };

export default async function NewPurchaseOrderPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "create_purchase_order", "New PO");
  // Vendors with their contracts: a line prefills its cost from the one contract in force (#1507).
  const [vendors, materials] = await Promise.all([
    runPageQuery("list_vendors_and_contracts", {}, ctx) as Promise<{ id: string; name: string; active: boolean; contracts: PoContract[] }[]>,
    runPageQuery("list_materials", {}, ctx) as Promise<{ id: string; name: string; purchase_uom: string; lot_tracked: boolean; default_vendor_id: string | null }[]>,
  ]);
  return <NewPoForm vendors={vendors.filter(vendor => vendor.active).map(({ id, name }) => ({ id, name }))} contracts={vendors.flatMap(vendor => vendor.contracts)} materials={materials} today={breweryDate(brewery.timeZone)} />;
}
