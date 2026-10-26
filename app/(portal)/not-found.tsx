// Render missing records and unmatched portal addresses inside the portal shell.
// Real failures still go to error.tsx.
import { NotFoundView } from "@/components/mgr/views/not-found";

export const metadata = { title: "Not found" };

export default function PortalNotFound() {
  return (
    <NotFoundView
      message="There is nothing at this address for your account. It may have been removed, or the link may be wrong."
      backLabel="Back to Orders"
      backHref="/portal/orders"
    />
  );
}
