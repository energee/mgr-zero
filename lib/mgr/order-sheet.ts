// lib/mgr/order-sheet.ts — the address of a record sheet: `?order=<id>` on the
// list that is open (Today, Work, Orders), or `?customer=<id>` on Customers, so
// the list's own filters survive, and a refresh or a shared link reopens the
// same sheet over the same list.
// A query parameter rather than an intercepted /orders/<id> route: the order's
// own pages (Confirm, Edit draft, Put back, Ship) navigate to /orders/<id> after
// they finish, and those must keep opening the full page.
// Each list page reads its parameter (app/(app)/orders/order-sheet.tsx,
// app/(app)/customers/customer-sheet.tsx); components/mgr/order-sheet-link.tsx writes it.

import { isUuid } from "@/lib/uuid";

export const ORDER_SHEET_PARAM = "order";
export const CUSTOMER_SHEET_PARAM = "customer";

/** The address's record id when it is one well-formed uuid; anything else opens no sheet. */
export function sheetId(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && isUuid(value) ? value : undefined;
}

/** `pathname` with `search` (no leading "?"), the sheet's `param` set to `id`, or closed when null. */
export function sheetHref(pathname: string, search: string, param: string, id: string | null): string {
  const query = new URLSearchParams(search);
  query.delete(param);
  if (id) query.set(param, id);
  const rest = query.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}
