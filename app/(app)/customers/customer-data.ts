import { cache } from "react";
import { notFound } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext, isUuid } from "@/lib/commands/context";
import { runPageQuery } from "@/lib/mgr/page-query";
import { orNotFound } from "@/lib/mgr/not-found";
import "@/lib/commands/all";

/** Share the authorized record read between the page and metadata within one request. */
export const getCustomerPageData = cache(async function getCustomerPageData(id: string) {
  if (!isUuid(id)) notFound();
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const snapshot = await orNotFound(runPageQuery("get_customer", { customerId: id }, ctx));
  return { brewery, ctx, snapshot };
});
