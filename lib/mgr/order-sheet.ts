// lib/mgr/order-sheet.ts — the address of the order sheet: `?order=<id>` on the
// list that is open (Today, Work, Orders), so the list's own filters survive,
// and a refresh or a shared link reopens the same sheet over the same list.
// A query parameter rather than an intercepted /orders/<id> route: the order's
// own pages (Confirm, Edit draft, Put back, Ship) navigate to /orders/<id> after
// they finish, and those must keep opening the full page.
// app/(app)/orders/order-sheet.tsx reads the parameter on each list page;
// components/mgr/order-sheet-link.tsx writes it.

import { isUuid } from "@/lib/uuid";

export const ORDER_SHEET_PARAM = "order";

/** The address's order id when it is one well-formed uuid; anything else opens no sheet. */
export function orderSheetId(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && isUuid(value) ? value : undefined;
}

/** `pathname` with `search` (no leading "?"), the order sheet set to `orderId`, or closed when null. */
export function orderSheetHref(pathname: string, search: string, orderId: string | null): string {
  const query = new URLSearchParams(search);
  query.delete(ORDER_SHEET_PARAM);
  if (orderId) query.set(ORDER_SHEET_PARAM, orderId);
  const rest = query.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}
