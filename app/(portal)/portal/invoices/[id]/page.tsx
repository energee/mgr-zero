// app/(portal)/portal/invoices/[id]/page.tsx — one invoice or credit memo
// for the signed-in customer (portal_invoice). QuickBooks Payments is parked,
// so an unpaid invoice uses the Payment unavailable drawing instead of a dead
// Pay button. Question invoice is question-form.tsx.
import { PortalInvoiceView } from "@/components/mgr/views/portal-invoice";
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
  const model = toPortalInvoiceViewProps(snapshot);
  return (
    <PortalInvoiceView
      model={model}
      footer={null}
      question={<QuestionForm invoiceId={snapshot.invoice.id} label={`${model.title} · ${model.total}`} />}
    />
  );
}
