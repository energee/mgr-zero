// components/mgr/views/customer-scope.tsx — the "Customer: <name> · Clear" line
// a register draws while its list is filtered to one customer (Orders, Invoices).
import Link from "next/link";

/** `to` names the register Clear returns to; the inventory's Clear has no href and stays inert. */
export function CustomerScope({ name, clearHref, to }: { name: string; clearHref?: string; to: string }) {
  return (
    <p className="text-sm">
      Customer: <strong className="font-medium wrap-anywhere">{name}</strong> ·{" "}
      {/* The shared 48px target on coarse pointers. */}
      <Link href={clearHref ?? "#"} data-to={to} className="inline-flex min-h-6 items-center text-muted-foreground underline pointer-coarse:min-h-12">Clear</Link>
    </p>
  );
}
