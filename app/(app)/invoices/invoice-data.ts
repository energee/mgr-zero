import { cache } from "react";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery } from "@/lib/mgr/page-query";
import { orNotFound } from "@/lib/mgr/not-found";
import "@/lib/commands/all";

/** Share the authorized record read between pages and metadata within one request. */
export const getInvoicePageData = cache(async function getInvoicePageData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const snapshot = await orNotFound(runPageQuery("get_invoice", { invoiceId: id }, ctx));
  return { brewery, ctx, snapshot };
});
