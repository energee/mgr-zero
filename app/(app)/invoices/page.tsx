// app/(app)/invoices/page.tsx — invoices and credit memos list. Totals come
// from list_invoices, which merges in subtotal_cents from the invoice_totals
// view (see the handler in lib/commands/orders.ts) rather than a separate
// command — list_invoices' shape is now { ...invoice, subtotal_cents }.
import Link from "next/link";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Invoice = {
  id: string;
  invoice_no: number | null;
  kind: "invoice" | "credit_memo";
  paid_at: string | null;
  subtotal_cents: number;
  customers: { name: string } | null;
};

export default async function InvoicesPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const invoices = (await runCommand("list_invoices", {}, ctx)) as Invoice[];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Invoices</h1>
      {invoices.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-normal">No.</th>
              <th className="py-1 font-normal">Kind</th>
              <th className="py-1 font-normal">Customer</th>
              <th className="py-1 font-normal">Total</th>
              <th className="py-1 font-normal">Paid</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t">
                <td className="py-1">
                  <Link href={`/invoices/${inv.id}`} className="underline underline-offset-2">
                    {inv.invoice_no ?? inv.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="py-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      inv.kind === "credit_memo" ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-800"
                    }`}
                  >
                    {inv.kind === "credit_memo" ? "credit memo" : "invoice"}
                  </span>
                </td>
                <td className="py-1">{inv.customers?.name ?? "—"}</td>
                <td className="py-1">${(inv.subtotal_cents / 100).toFixed(2)}</td>
                <td className="py-1">{inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted-foreground">No invoices yet.</p>
      )}
    </div>
  );
}
