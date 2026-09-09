// app/(portal)/portal/invoices/page.tsx — Invoice history (screen record):
// the caller's invoices and credit memos (portal_invoices). portal_invoices
// returns raw invoice_lines rather than a subtotal column (unlike staff's
// list_invoices. The adapter uses the synchronized QuickBooks total when one
// exists and otherwise sums frozen local lines. A row opens portal_invoice.
import { PortalInvoicesView } from "@/components/mgr/views/portal-invoices";
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { toPortalInvoicesViewProps } from "@/lib/mgr/portal-invoices-view";
import "@/lib/commands/all";

type Invoice = { id: string; invoice_no: number | null; kind: "invoice" | "credit_memo"; due_on: string | null; paid_at: string | null; qbo_remote_state: "live" | "voided" | "deleted"; qbo_total_cents: number | null; qbo_balance_cents: number | null; written_off_at: string | null; invoice_lines: { amount_cents: number }[] };

export default async function PortalInvoicesPage() {
  const customer = await getActiveCustomer();
  const invoices = (await runCommand("portal_invoices", {}, await buildContext(customer.breweryId))) as Invoice[];
  return (
    <PortalInvoicesView
      model={toPortalInvoicesViewProps({ customerName: customer.customerName, invoices })}
      linkRows
    />
  );
}
