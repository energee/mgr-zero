// app/(app)/catalog/brand-sheet.tsx — the brand sheet for Catalog: given the id
// from the page's ?brand=<uuid> (sheetId, lib/mgr/order-sheet.ts) it opens the
// full Brand screen (BrandDetail) in a sheet over the list. The page renders it
// only for a role that may open Brand, and only when the address names an id.
import { AddressSheet } from "@/components/mgr/order-sheet-link";
import { BRAND_SHEET_PARAM } from "@/lib/mgr/order-sheet";
import { BrandDetail, findBrandPageData } from "./brands/[id]/brand-detail";

export async function BrandSheetFromAddress({ id }: { id: string }) {
  // A brand this brewery has not got (a stale link, a switched brewery) leaves the
  // sheet closed: a not-found here would replace the list under it.
  if (!(await findBrandPageData(id))) return null;
  return <AddressSheet param={BRAND_SHEET_PARAM} title="Brand"><BrandDetail id={id} /></AddressSheet>;
}
