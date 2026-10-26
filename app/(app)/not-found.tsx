// Render missing records and unmatched staff addresses inside the staff shell.
// Real failures still go to error.tsx.
import Link from "next/link";

export const metadata = { title: "Not found" };

export default function AppNotFound() {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-muted-foreground">
        There is nothing at this address in this brewery. It may have been removed, or the link may be wrong.
      </p>
      <Link href="/" className="w-fit underline">Back to Today</Link>
    </div>
  );
}
