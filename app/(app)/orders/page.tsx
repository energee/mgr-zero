// Authenticate the route; browser queries reuse data across visits and filters.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { optionalPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { pageCursor } from "@/lib/mgr/history-page";
import { parseOrderStatus } from "@/lib/mgr/order-status";
import { OrdersClient } from "./orders-client";
import "@/lib/commands/all";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/orders") };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string | string[]; customerId?: string; cursor?: string | string[] }> }) {
  const [params, brewery] = await Promise.all([searchParams, getActiveBrewery()]);
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "list_orders", "Orders");
  // The filter names its customer even when no order matches, so the name
  // comes from get_customer rather than the first listed row.
  const customer = params.customerId ? await optionalPageQuery<{ customer: { name: string } }>("get_customer", { customerId: params.customerId }, ctx) : undefined;
  return <OrdersClient roles={brewery.roles} timeZone={brewery.timeZone} status={parseOrderStatus(params.status)} customerId={params.customerId} customerName={customer?.customer.name} cursor={pageCursor(params.cursor)} />;
}
