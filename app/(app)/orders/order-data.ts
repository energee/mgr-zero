import { cache } from "react";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery } from "@/lib/mgr/page-query";
import { notFound } from "next/navigation";
import { orNotFound, orNull } from "@/lib/mgr/not-found";
import type { ShipSources } from "@/lib/commands/orders";
import "@/lib/commands/all";

/** The authorized record read, shared by pages, metadata and the order sheet within one request;
 *  null when the id matches nothing the caller may see (the order sheet then stays closed). */
export const findOrderPageData = cache(async function findOrderPageData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const snapshot = await orNull(runPageQuery("get_order", { orderId: id }, ctx));
  return snapshot === null ? null : { brewery, ctx, snapshot };
});

/** findOrderPageData for a page: a missing order renders app/(app)/not-found.tsx. */
export const getOrderPageData = cache(async function getOrderPageData(id: string) {
  return (await findOrderPageData(id)) ?? notFound();
});

export const getOrderShipSources = cache(async function getOrderShipSources(id: string) {
  const { ctx } = await getOrderPageData(id);
  return await orNotFound(runPageQuery("get_order_ship_sources", { orderId: id }, ctx)) as ShipSources;
});
