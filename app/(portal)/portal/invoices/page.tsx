// app/(portal)/portal/invoices/page.tsx — the caller's invoices and credit
// memos (portal_invoices). portal_invoices returns raw invoice_lines rather
// than a subtotal_cents column (unlike staff's list_invoices, which reads
// the invoice_totals view), so totals are summed client-side here.
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type InvoiceLine = { amount_cents: number };
type Invoice = {
  id: string;
  invoice_no: number | null;
  kind: "invoice" | "credit_memo";
  paid_at: string | null;
  invoice_lines: InvoiceLine[];
};

export default async function PortalInvoicesPage() {
  const customer = await getActiveCustomer();
  const ctx = await buildContext(customer.breweryId);
  const invoices = (await runCommand("portal_invoices", {}, ctx)) as Invoice[];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Invoices</h1>
      {invoices.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-normal">No.</th>
              <th className="py-1 font-normal">Kind</th>
              <th className="py-1 font-normal">Total</th>
              <th className="py-1 font-normal">Paid</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const totalCents = inv.invoice_lines.reduce((sum, l) => sum + l.amount_cents, 0);
              return (
                <tr key={inv.id} className="border-t">
                  <td className="py-1">{inv.invoice_no ?? inv.id.slice(0, 8)}</td>
                  <td className="py-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        inv.kind === "credit_memo" ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-800"
                      }`}
                    >
                      {inv.kind === "credit_memo" ? "credit memo" : "invoice"}
                    </span>
                  </td>
                  <td className="py-1">${(totalCents / 100).toFixed(2)}</td>
                  <td className="py-1">{inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted-foreground">No invoices yet.</p>
      )}
    </div>
  );
}
