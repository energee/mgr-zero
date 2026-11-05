// app/(app)/customers/customer-sheet.tsx — the customer sheet for the Customers
// list: given the id from the page's ?customer=<uuid> (sheetId,
// lib/mgr/order-sheet.ts) it opens the full Customer screen (CustomerDetail) in
// a sheet over the list. The page renders it only when the address names an id.
import { AddressSheet } from "@/components/mgr/order-sheet-link";
import { CUSTOMER_SHEET_PARAM } from "@/lib/mgr/order-sheet";
import { CustomerDetail } from "./[id]/customer-detail";
import { findCustomerPageData } from "./customer-data";

export async function CustomerSheetFromAddress({ id }: { id: string }) {
  // A customer this brewery has not got (a stale link, a switched brewery) leaves the
  // sheet closed: a not-found here would replace the list under it.
  if (!(await findCustomerPageData(id))) return null;
  return <AddressSheet param={CUSTOMER_SHEET_PARAM} title="Customer"><CustomerDetail id={id} /></AddressSheet>;
}
