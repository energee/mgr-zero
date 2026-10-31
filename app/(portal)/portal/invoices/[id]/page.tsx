// app/(portal)/portal/invoices/[id]/page.tsx — one invoice or credit memo
// for the signed-in customer (portal_invoice). The permanent MGR Pay route
// rechecks ownership, balance and QuickBooks state before redirecting.
import { PortalInvoiceView } from "@/components/mgr/views/portal-invoice";
import { getPortalContext } from "@/lib/portal";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { toPortalInvoiceViewProps, type PortalInvoiceSnapshot } from "@/lib/mgr/portal-invoice-view";
import { QuestionForm } from "./question-form";
import { cache } from "react";

const getInvoiceData = cache(async function getInvoiceData(id: string) {
  const { ctx } = await getPortalContext();
  return orNotFound(runCommand("portal_invoice", { invoiceId: id }, ctx) as Promise<PortalInvoiceSnapshot>);
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getInvoiceData(id);
  return {};
}

export default async function PortalInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ payment?: string }> }) {
  const { id } = await params;
  const failedPayment = (await searchParams).payment === "unavailable";
  const snapshot = await getInvoiceData(id);
  const model = toPortalInvoiceViewProps({ ...snapshot, backHref: "/portal/invoices" });
  // The Pay route redirects here with ?payment=unavailable when QuickBooks
  // returns no link; the invoice then renders as unavailable.
  const payable = model.payable && !failedPayment;
  return (
    <PortalInvoiceView
      model={model}
      variant={payable ? "pay" : !model.paid && model.status === "Unpaid" ? "unavailable" : undefined}
      paymentAction={payable ? `/portal/invoices/${snapshot.invoice.id}/pay` : undefined}
      question={<QuestionForm invoiceId={snapshot.invoice.id} label={`${model.title} · ${model.total}`} breweryName={model.breweryName} />}
    />
  );
}
