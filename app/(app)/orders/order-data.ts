import { cache } from "react";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery } from "@/lib/mgr/page-query";
import { orNotFound } from "@/lib/mgr/not-found";
import type { ShipSources } from "@/lib/commands/orders";
import "@/lib/commands/all";

/** Share the authorized record read between pages and metadata within one request. */
export const getOrderPageData = cache(async function getOrderPageData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const snapshot = await orNotFound(runPageQuery("get_order", { orderId: id }, ctx));
  return { brewery, ctx, snapshot };
});

export const getOrderShipSources = cache(async function getOrderShipSources(id: string) {
  const { ctx } = await getOrderPageData(id);
  return await orNotFound(runPageQuery("get_order_ship_sources", { orderId: id }, ctx)) as ShipSources;
});
