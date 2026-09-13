import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { NewPoForm } from "../new-po-form";
import "@/lib/commands/all";

export default async function NewPurchaseOrderPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "create_purchase_order", "New PO");
  const [vendors, materials] = await Promise.all([
    runPageQuery("list_vendors", {}, ctx) as Promise<{ id: string; name: string; active: boolean }[]>,
    runPageQuery("list_materials", {}, ctx) as Promise<{ id: string; name: string; purchase_uom: string; lot_tracked: boolean }[]>,
  ]);
  return <NewPoForm vendors={vendors.filter(vendor => vendor.active)} materials={materials} />;
}
