// app/(app)/orders/new/page.tsx — New order: the live adapter that loads the
// customer→ship-to, location and active-SKU option lists for OrderForm.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { OrderForm, type CustomerOption, type LocationOption } from "../order-form";
import "@/lib/commands/all";

export default async function NewOrderPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "create_order", "New order");
  const [customers, locations, skus] = await Promise.all([
    runPageQuery("list_customers", { includeShipTos: true }, ctx) as Promise<CustomerOption[]>,
    runPageQuery("list_locations", {}, ctx) as Promise<LocationOption[]>,
    runPageQuery("list_skus", {}, ctx) as Promise<{ id: string; name: string; active: boolean; brands: { name: string } | null }[]>,
  ]);
  return <OrderForm customers={customers} locations={locations} skus={skus.filter(sku => sku.active).map(sku => ({ id: sku.id, label: sku.brands ? `${sku.brands.name} — ${sku.name}` : sku.name }))} />;
}
