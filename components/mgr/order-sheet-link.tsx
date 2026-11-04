// components/mgr/order-sheet-link.tsx — the live order sheet's two ends: a link
// that opens an order over the current list (Today, Work, Orders) by adding
// ?order=<id> to its address, and the sheet that closes by removing it again
// (lib/mgr/order-sheet.ts says why the address, not a route). Live only: the
// screen inventory draws RecordSheet and plain names, because its frames are
// static and have no address to change.
"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RecordSheet } from "@/components/mgr/record-sheet";
import { orderSheetHref } from "@/lib/mgr/order-sheet";

/** scroll={false}: opening the sheet leaves the list where it was scrolled. */
export function OrderSheetLink({ orderId, className, children }: { orderId: string; className?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  return <Link href={orderSheetHref(pathname, search.toString(), orderId)} scroll={false} className={className}>{children}</Link>;
}

/** Closing replaces the address, so the list's filters stay and Back does not reopen a closed sheet. */
export function OrderSheet({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return <RecordSheet title="Order" onClose={() => router.replace(orderSheetHref(pathname, search.toString(), null), { scroll: false })}>{children}</RecordSheet>;
}
