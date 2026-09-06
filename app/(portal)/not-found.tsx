// app/(portal)/not-found.tsx — rendered inside the portal shell when an order
// or invoice id matches nothing this customer may see (lib/mgr/not-found.ts).
// Real failures still go to error.tsx.
import Link from "next/link";

export default function PortalNotFound() {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-muted-foreground">
        There is no order or invoice at this address for your account. It may have been removed, or the link may be wrong.
      </p>
      <Link href="/portal/orders" className="w-fit underline">Back to Orders</Link>
    </div>
  );
}
