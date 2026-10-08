// Authenticate the route; browser queries reuse data across visits and filters.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { optionalPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { pageCursor } from "@/lib/mgr/history-page";
import { OrdersClient } from "./orders-client";
import "@/lib/commands/all";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; customerId?: string; cursor?: string | string[] }> }) {
  const [params, brewery] = await Promise.all([searchParams, getActiveBrewery()]);
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "list_orders", "Orders");
  // The filter names its customer even when no order matches, so the name
  // comes from get_customer rather than the first listed row.
  const customer = params.customerId ? await optionalPageQuery<{ customer: { name: string } }>("get_customer", { customerId: params.customerId }, ctx) : undefined;
  return <OrdersClient role={brewery.role} status={params.status} customerId={params.customerId} customerName={customer?.customer.name} cursor={pageCursor(params.cursor)} />;
}
