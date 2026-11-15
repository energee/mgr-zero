// components/mgr/order-sheet-link.tsx — a live record sheet's two ends: a link
// that opens a record over the current list (an order on Today, Work or Orders;
// a customer on Customers) by adding ?<param>=<id> to its address, and the sheet
// that closes by removing it again (lib/mgr/order-sheet.ts says why the address,
// not a route). Live only: the screen inventory draws RecordSheet and plain
// names, because its frames are static and have no address to change.
"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RecordSheet } from "@/components/mgr/record-sheet";
import { sheetHref } from "@/lib/mgr/order-sheet";
import { rowLinkPrefetch } from "@/lib/mgr/row-link-prefetch";

/** scroll={false}: opening the sheet leaves the list where it was scrolled.
 *  The href names a record, so it is not prefetched: a list of rows would
 *  otherwise request its own page once per row (lib/mgr/row-link-prefetch.ts). */
export function SheetLink({ param, id, className, children }: { param: string; id: string; className?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const href = sheetHref(pathname, search.toString(), param, id);
  return <Link href={href} prefetch={rowLinkPrefetch(href)} scroll={false} className={className}>{children}</Link>;
}

/** Closing replaces the address, so the list's filters stay and Back does not reopen a closed sheet. */
export function AddressSheet({ param, title, children }: { param: string; title: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return <RecordSheet title={title} onClose={() => router.replace(sheetHref(pathname, search.toString(), param, null), { scroll: false })}>{children}</RecordSheet>;
}
