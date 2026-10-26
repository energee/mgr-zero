// Render missing records and unmatched portal addresses inside the portal shell.
// Real failures still go to error.tsx.
import Link from "next/link";

export const metadata = { title: "Not found" };

export default function PortalNotFound() {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-muted-foreground">
        There is nothing at this address for your account. It may have been removed, or the link may be wrong.
      </p>
      <Link href="/portal/orders" className="w-fit underline">Back to Orders</Link>
    </div>
  );
}
