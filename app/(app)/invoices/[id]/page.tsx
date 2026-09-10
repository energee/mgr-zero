// app/(app)/invoices/[id]/page.tsx — Invoice (screen record): one invoice or
// credit memo with its lines and total, the buyer's questions about it with
// Mark answered (resolve_invoice_question, mark-answered.tsx), and for an
// invoice a credit memo against a subset of lines (credit-memo-form.tsx).
// QuickBooks mapping, exact retry, corrected re-push and local write-off use
// the same registered commands as the API. An unknown id renders not-found.
import { InvoiceView } from "@/components/mgr/views/invoice";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { toInvoiceViewProps } from "@/lib/mgr/invoice-view";
import { CreditMemoForm } from "./credit-memo-form";
import { MarkAnswered } from "./mark-answered";
import { qboInvoicePresentation } from "@/lib/mgr/qbo-ui";
import { QboInvoiceRow } from "@/app/(app)/settings/accounting/qbo-controls";

type Invoice = { id: string; shipment_id: string | null; invoice_no: number | null; kind: "invoice" | "credit_memo"; issued_on: string; due_on: string | null; paid_at: string | null; qbo_invoice_id: string | null; qbo_sync_status: "pending" | "pushed" | "push_failed"; qbo_sync_error: string | null; qbo_remote_state: "live" | "voided" | "deleted"; qbo_total_cents: number | null; qbo_balance_cents: number | null; qbo_cash_collected_cents: number; qbo_accountant_drift: boolean; written_off_at: string | null; customers: { id: string; name: string; qbo_customer_id: string | null; qbo_realm_id: string | null } | null };
type InvoiceLine = { id: string; kind: string; sku_id: string | null; qty: number; unit_price_cents: number; amount_cents: number; description: string; skus: { name: string; qbo_item_id: string | null; qbo_realm_id: string | null } | null };
type Question = { id: string; body: string; created_at: string; answered_at: string | null; customers: { name: string } | null };
type LocationRow = { id: string; name: string };

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ invoice, lines, hasPendingPush }, locations, questions, health] = (await Promise.all([
    orNotFound(runCommand("get_invoice", { invoiceId: id }, ctx)), runCommand("list_locations", {}, ctx),
    brewery.role === "warehouse" ? [] : runCommand("list_invoice_questions", { invoiceId: id }, ctx),
    brewery.role === "admin" || brewery.role === "sales" ? runCommand("get_qbo_connection", {}, ctx) : null,
  ])) as [{ invoice: Invoice; lines: InvoiceLine[]; hasPendingPush: boolean }, LocationRow[], Question[], { connected: boolean; state: string; realmId?: string; realmLabel: string | null; depositItemId?: string | null } | null];
  const credit = invoice.kind === "credit_memo";
  const memo = !credit && brewery.role !== "warehouse"
    ? <CreditMemoForm shipmentId={invoice.shipment_id} invoiceId={invoice.id} lines={lines.filter(l => l.sku_id).map((l) => ({ id: l.id, skuId: l.sku_id!, label: l.skus?.name ?? l.description, qty: Number(l.qty) }))} locations={locations.map((l) => ({ id: l.id, name: l.name }))} />
    : undefined;
  const realm = health?.connected ? health.realmId : null;
  const missingMappings = !invoice.customers?.qbo_customer_id || (realm && invoice.customers.qbo_realm_id !== realm)
    || lines.some(line => line.kind === "sku" ? !line.skus?.qbo_item_id || (realm && line.skus.qbo_realm_id !== realm) : /keg_deposit/.test(line.kind) && !health?.depositItemId);
  const presentation = qboInvoicePresentation({ kind: invoice.kind, role: brewery.role, connected: Boolean(health?.connected), syncStatus: invoice.qbo_sync_status, hasPendingPush, syncError: invoice.qbo_sync_error, remoteState: invoice.qbo_remote_state, balanceCents: invoice.qbo_balance_cents, cashCollectedCents: invoice.qbo_cash_collected_cents, totalCents: invoice.qbo_total_cents, accountantDrift: invoice.qbo_accountant_drift, writtenOff: Boolean(invoice.written_off_at), missingMappings: Boolean(missingMappings) });
  const model = toInvoiceViewProps({ invoice, lines, questions, backHref: "/invoices" });
  return (
    <InvoiceView
      model={model}
      headerAction={memo}
      questionAction={(q) => <MarkAnswered questionId={q.id} />}
      qboGate={<QboInvoiceRow invoiceId={invoice.id} invoiceLabel={model.title} detail={presentation.detail} balanceCents={invoice.qbo_balance_cents} actions={presentation.actions} healthy={invoice.qbo_sync_status === "pushed" && invoice.qbo_remote_state === "live" && !invoice.qbo_accountant_drift} />}
    />
  );
}
