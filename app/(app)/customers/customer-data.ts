// app/(app)/customers/customer-data.ts — the get_customer read behind the
// customer page, its metadata and the customer sheet (customer-sheet.tsx).
import { isUuid } from "@/lib/uuid";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery } from "@/lib/mgr/page-query";
import { orNull } from "@/lib/mgr/not-found";
import "@/lib/commands/all";

/** The authorized record read, shared by the page, metadata and the customer sheet within one request;
 *  null when the id matches nothing the caller may see (the customer sheet then stays closed). */
export const findCustomerPageData = cache(async function findCustomerPageData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const snapshot = await orNull(runPageQuery("get_customer", { customerId: id }, ctx));
  return snapshot === null ? null : { brewery, ctx, snapshot };
});

/** findCustomerPageData for a page: a malformed or missing customer renders app/(app)/not-found.tsx. */
export const getCustomerPageData = cache(async function getCustomerPageData(id: string) {
  if (!isUuid(id)) notFound();
  return (await findCustomerPageData(id)) ?? notFound();
});
