// Authenticate the route; browser queries reuse data across visits and filters.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { requirePagePermission } from "@/lib/mgr/page-query";
import { OrdersClient } from "./orders-client";
import "@/lib/commands/all";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; customerId?: string }> }) {
  const [params, brewery] = await Promise.all([searchParams, getActiveBrewery()]);
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "list_orders", "Orders");
  return <OrdersClient role={brewery.role} status={params.status} customerId={params.customerId} />;
}
