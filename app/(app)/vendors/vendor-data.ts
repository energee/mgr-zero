// app/(app)/vendors/vendor-data.ts — the one vendor read that the vendor page
// and its metadata share within a request (#1586). list_vendors_and_contracts
// narrowed to the id returns no row for a vendor the caller cannot see, which
// is the page's 404.
import { cache } from "react";
import { notFound } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext, isUuid } from "@/lib/commands/context";
import { runPageQuery } from "@/lib/mgr/page-query";
import type { VendorRecord } from "@/lib/mgr/vendor-detail-view";
import type { Vendor } from "./vendor-form";
import "@/lib/commands/all";

type VendorRow = Vendor & Pick<VendorRecord, "observed" | "contracts">;

/** Share the authorized vendor read between the page and metadata within one request. */
export const getVendorPageData = cache(async function getVendorPageData(id: string) {
  if (!isUuid(id)) notFound();
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [vendor] = await runPageQuery("list_vendors_and_contracts", { vendorId: id }, ctx) as VendorRow[];
  if (!vendor) notFound();
  return { ctx, vendor };
});
