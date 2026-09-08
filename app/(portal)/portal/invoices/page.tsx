// app/(portal)/portal/invoices/page.tsx — Invoice history (screen record):
// the caller's invoices and credit memos (portal_invoices). portal_invoices
// returns raw invoice_lines rather than a subtotal column (unlike staff's
// list_invoices, which reads the invoice_totals view), so totals are summed
// here. A row opens the invoice detail (portal_invoice).
import { E } from "@/components/mgr/e";
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { docNo } from "@/lib/mgr/doc-no";
import { money } from "@/lib/mgr/money";
import "@/lib/commands/all";

type Invoice = { id: string; invoice_no: number | null; kind: "invoice" | "credit_memo"; due_on: string | null; paid_at: string | null; invoice_lines: { amount_cents: number }[] };

export default async function PortalInvoicesPage() {
  const customer = await getActiveCustomer();
  const invoices = (await runCommand("portal_invoices", {}, await buildContext(customer.breweryId))) as Invoice[];
  return (
    <>
      {E.hd("Invoices", customer.customerName)}
      {invoices.length === 0 ? E.blank("No invoices yet") : invoices.map((inv) => {
        const total = inv.invoice_lines.reduce((sum, l) => sum + l.amount_cents, 0);
        const credit = inv.kind === "credit_memo";
        const paid = inv.paid_at !== null;
        return (
          <div key={inv.id}>{E.row(docNo(credit ? "CM" : "INV", inv.invoice_no, credit ? "Credit memo" : "Invoice"),
            credit ? "credit" : paid ? `paid ${new Date(inv.paid_at!).toLocaleDateString()}` : inv.due_on ? `due ${inv.due_on}` : "unpaid",
            credit || paid ? money(total) : E.act(money(total), "info", `/portal/invoices/${inv.id}`), credit || paid ? "ok" : "")}</div>
        );
      })}
    </>
  );
}
