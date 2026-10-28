// app/(app)/orders/new/page.tsx — New order: the live adapter that loads the
// customer→ship-to, location and active-SKU option lists for OrderForm
// (OrderForm narrows wholesale SKUs to the customer's priced ones).
// `?customerId=` (from a customer's page or filtered Orders list) starts the
// form on that customer when it is one of the listed customers (#1506).
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { requirePagePermission } from "@/lib/mgr/page-query";
import { NewOrderClient } from "./new-order-client";
import "@/lib/commands/all";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/orders/new") };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ customerId?: string | string[] }> }) {
  const [params, brewery] = await Promise.all([searchParams, getActiveBrewery()]);
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "create_order", "New order");
  return <NewOrderClient timeZone={brewery.timeZone} customerId={typeof params.customerId === "string" ? params.customerId : undefined} />;
}
