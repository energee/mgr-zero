// app/(app)/invoices/[id]/page.tsx — Invoice (screen record): one invoice or
// credit memo with its lines and total, the buyer's questions about it with
// Mark answered (resolve_invoice_question, mark-answered.tsx), and for an
// invoice a credit memo against a subset of lines (credit-memo-form.tsx).
// The QuickBooks mappings and push wait for Program 13. An unknown or
// malformed id renders not-found.tsx.
import { InvoiceView } from "@/components/mgr/views/invoice";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { toInvoiceViewProps } from "@/lib/mgr/invoice-view";
import { CreditMemoForm } from "./credit-memo-form";
import { MarkAnswered } from "./mark-answered";

type Invoice = { id: string; shipment_id: string | null; invoice_no: number | null; kind: "invoice" | "credit_memo"; issued_on: string; due_on: string | null; paid_at: string | null; qbo_remote_state: "live" | "voided" | "deleted"; qbo_total_cents: number | null; qbo_balance_cents: number | null; qbo_accountant_drift: boolean; written_off_at: string | null; customers: { name: string } | null };
type InvoiceLine = { id: string; sku_id: string; qty: number; unit_price_cents: number; amount_cents: number; description: string; skus: { name: string } | null };
type Question = { id: string; body: string; created_at: string; answered_at: string | null; customers: { name: string } | null };
type LocationRow = { id: string; name: string };

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ invoice, lines }, locations, questions] = (await Promise.all([
    orNotFound(runCommand("get_invoice", { invoiceId: id }, ctx)), runCommand("list_locations", {}, ctx),
    brewery.role === "warehouse" ? [] : runCommand("list_invoice_questions", { invoiceId: id }, ctx),
  ])) as [{ invoice: Invoice; lines: InvoiceLine[] }, LocationRow[], Question[]];
  const credit = invoice.kind === "credit_memo";
  const memo = !credit && brewery.role !== "warehouse"
    ? <CreditMemoForm shipmentId={invoice.shipment_id} invoiceId={invoice.id} lines={lines.map((l) => ({ id: l.id, skuId: l.sku_id, label: l.skus?.name ?? l.description, qty: Number(l.qty) }))} locations={locations.map((l) => ({ id: l.id, name: l.name }))} />
    : undefined;
  return (
    <InvoiceView
      model={toInvoiceViewProps({ invoice, lines, questions, backHref: "/invoices" })}
      headerAction={memo}
      questionAction={(q) => <MarkAnswered questionId={q.id} />}
      qboGate="mapping and push aren’t connected yet"
    />
  );
}
