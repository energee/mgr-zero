// app/(app)/invoices/[id]/page.tsx — invoice/credit-memo detail: line items
// and total (summed client-side from get_invoice's lines; see task-9-report
// for why list_invoices/get_invoice split totals this way). For an invoice
// (not a credit memo — the create_credit_memo fn rejects crediting a credit
// memo), offers a dialog to create a credit memo against a subset of lines.
// An unknown or malformed id renders not-found.tsx; other failures throw to
// the (app) error boundary.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { CreditMemoForm } from "./credit-memo-form";

type Invoice = {
  id: string;
  invoice_no: number | null;
  kind: "invoice" | "credit_memo";
  issued_on: string;
  paid_at: string | null;
  customers: { name: string } | null;
};
type InvoiceLine = {
  id: string;
  qty: number;
  unit_price_cents: number;
  amount_cents: number;
  description: string;
  skus: { name: string } | null;
};
type LocationRow = { id: string; name: string; kind: "warehouse" | "taproom" };

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ invoice, lines }, locationRows] = (await Promise.all([
    orNotFound(runCommand("get_invoice", { invoiceId: id }, ctx)),
    runCommand("list_locations", {}, ctx),
  ])) as [{ invoice: Invoice; lines: InvoiceLine[] }, LocationRow[]];

  const total = lines.reduce((sum, l) => sum + l.amount_cents, 0);
  const locations = locationRows.map((l) => ({ id: l.id, name: l.name }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            {invoice.kind === "credit_memo" ? "Credit memo" : "Invoice"} {invoice.invoice_no ?? invoice.id.slice(0, 8)}
          </h1>
          <div className="text-sm text-muted-foreground">
            {invoice.customers?.name ?? "—"} · issued {invoice.issued_on}
            {invoice.paid_at ? ` · paid ${new Date(invoice.paid_at).toLocaleDateString()}` : ""}
          </div>
        </div>
        {invoice.kind === "invoice" && (
          <CreditMemoForm
            invoiceId={invoice.id}
            lines={lines.map((l) => ({ id: l.id, label: l.skus?.name ?? l.description, qty: Number(l.qty) }))}
            locations={locations}
          />
        )}
      </div>

      <section className="flex flex-col gap-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-normal">Item</th>
              <th className="py-1 font-normal">Qty</th>
              <th className="py-1 font-normal">Unit price</th>
              <th className="py-1 font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="py-1">{l.skus?.name ?? l.description}</td>
                <td className="py-1">{l.qty}</td>
                <td className="py-1">${(l.unit_price_cents / 100).toFixed(2)}</td>
                <td className="py-1">${(l.amount_cents / 100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td className="py-1" colSpan={3}>
                Total
              </td>
              <td className="py-1">${(total / 100).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
