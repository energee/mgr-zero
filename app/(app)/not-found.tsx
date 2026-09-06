// app/(app)/not-found.tsx — rendered inside the staff shell when a detail page
// calls notFound() (lib/mgr/not-found.ts): an unknown or malformed order,
// customer, or invoice id. Real failures still go to error.tsx.
import Link from "next/link";

export default function AppNotFound() {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-muted-foreground">
        There is no record at this address in this brewery. It may have been removed, or the link may be wrong.
      </p>
      <Link href="/" className="w-fit underline">Back to Today</Link>
    </div>
  );
}
