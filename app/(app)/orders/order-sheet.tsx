// app/(app)/orders/order-sheet.tsx — the order sheet for a list page (Today,
// Work, Orders): given the id from the page's ?order=<uuid> (orderSheetId,
// lib/mgr/order-sheet.ts) it opens the full Order screen (OrderDetail) in a
// sheet over the list. A page renders it only when the address names an id, so
// a list without one has nothing async to wait for.
import { OrderSheet } from "@/components/mgr/order-sheet-link";
import { OrderDetail } from "./[id]/order-detail";
import { findOrderPageData } from "./order-data";

export async function OrderSheetFromAddress({ id }: { id: string }) {
  // An order this brewery has not got (a stale link, a switched brewery) leaves the
  // sheet closed: a not-found here would replace the list under it.
  if (!(await findOrderPageData(id))) return null;
  return <OrderSheet><OrderDetail id={id} /></OrderSheet>;
}
