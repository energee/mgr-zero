// app/(app)/orders/new/page.tsx — New order: the live adapter that loads the
// customer→ship-to, location and active-SKU option lists for OrderForm.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { requirePagePermission } from "@/lib/mgr/page-query";
import { NewOrderClient } from "./new-order-client";
import "@/lib/commands/all";

export default async function NewOrderPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "create_order", "New order");
  return <NewOrderClient />;
}
