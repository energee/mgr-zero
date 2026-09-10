// app/(portal)/portal/invoices/[id]/page.tsx — one invoice or credit memo
// for the signed-in customer (portal_invoice). The permanent MGR Pay route
// rechecks ownership, balance and QuickBooks state before redirecting.
import { PortalInvoiceView } from "@/components/mgr/views/portal-invoice";
import { Button } from "@/components/ui/button";
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { toPortalInvoiceViewProps, type PortalInvoiceSnapshot } from "@/lib/mgr/portal-invoice-view";
import { QuestionForm } from "./question-form";

export default async function PortalInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getActiveCustomer();
  const ctx = await buildContext(customer.breweryId);
  const snapshot = await orNotFound(runCommand("portal_invoice", { invoiceId: id }, ctx) as Promise<PortalInvoiceSnapshot>);
  const model = toPortalInvoiceViewProps({ ...snapshot, backHref: "/portal/invoices" });
  const payment = model.payable ? <Button asChild><a href={`/portal/invoices/${snapshot.invoice.id}/pay`} target="_blank" rel="noreferrer">Pay invoice</a></Button> : null;
  return (
    <PortalInvoiceView
      model={model}
      variant={model.payable ? "pay" : !model.paid && model.status === "Unpaid" ? "unavailable" : undefined}
      footer={payment}
      question={<QuestionForm invoiceId={snapshot.invoice.id} label={`${model.title} · ${model.total}`} />}
    />
  );
}
