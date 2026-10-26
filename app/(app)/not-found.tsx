// Render missing records and unmatched staff addresses inside the staff shell.
// Real failures still go to error.tsx.
import { NotFoundView } from "@/components/mgr/views/not-found";

export const metadata = { title: "Not found" };

export default function AppNotFound() {
  return (
    <NotFoundView
      message="There is nothing at this address in this brewery. It may have been removed, or the link may be wrong."
      backLabel="Back to Today"
      backHref="/"
    />
  );
}
