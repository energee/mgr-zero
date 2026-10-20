// app/(app)/invoices/[id]/page.tsx — Invoice (screen record): one invoice or
// credit memo with its lines and total, the buyer's questions about it with
// Mark answered (resolve_invoice_question, mark-answered.tsx), and for an
// invoice still owed or paid (invoiceIsCreditable) Return in the closing
// Correct a shipment section: a credit memo against a subset of lines
// (credit-memo-form.tsx).
// QuickBooks mapping, exact retry, corrected re-push and local write-off use
// the same registered commands as the API. An unknown id renders not-found.
import { InvoiceReturnButton, InvoiceView } from "@/components/mgr/views/invoice";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { canRun } from "@/lib/commands/registry";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { invoiceMappingRows, toInvoiceViewProps } from "@/lib/mgr/invoice-view";
import { MarkAnswered } from "./mark-answered";
import { qboInvoicePresentation, type QboStaffInvoiceLink } from "@/lib/mgr/qbo-ui";
import { invoiceIsCreditable } from "@/lib/mgr/invoice-state";
import { QboInvoiceActions } from "@/app/(app)/settings/accounting/qbo-controls";

type Invoice = { id: string; shipment_id: string | null; invoice_no: number | null; kind: "invoice" | "credit_memo"; issued_on: string; due_on: string | null; paid_at: string | null; qbo_invoice_id: string | null; qbo_sync_status: "pending" | "pushed" | "push_failed" | "not_synced"; qbo_sync_error: string | null; qbo_remote_state: "live" | "voided" | "deleted"; qbo_total_cents: number | null; qbo_tax_cents: number | null; qbo_balance_cents: number | null; qbo_cash_collected_cents: number; qbo_accountant_drift: boolean; written_off_at: string | null; customers: { id: string; name: string; qbo_customer_id: string | null; qbo_realm_id: string | null } | null };
type InvoiceLine = { id: string; kind: string; sku_id: string | null; qty: number; unit_price_cents: number; amount_cents: number; description: string; skus: { name: string; qbo_item_id: string | null; qbo_realm_id: string | null } | null };
type Question = { id: string; body: string; created_at: string; answered_at: string | null; customers: { name: string } | null };

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ invoice, lines, hasPendingPush, quickbooksLink }, questions, health] = (await Promise.all([
    orNotFound(runCommand("get_invoice", { invoiceId: id }, ctx)),
    canRun(ctx, "list_invoice_questions") ? runCommand("list_invoice_questions", { invoiceId: id }, ctx) : [],
    brewery.roles.includes("admin") || brewery.roles.includes("sales") ? runCommand("get_qbo_connection", {}, ctx) : null,
  ])) as [{ invoice: Invoice; lines: InvoiceLine[]; hasPendingPush: boolean; quickbooksLink: QboStaffInvoiceLink | null }, Question[], { connected: boolean; state: string; realmId?: string; realmLabel: string | null; depositItemId?: string | null; oneWayFeeItemId?: string | null } | null];
  const credit = invoice.kind === "credit_memo";
  const memo = invoiceIsCreditable(invoice) && canRun(ctx, "return_shipment")
    ? <InvoiceReturnButton href={`/invoices/${invoice.id}/return`} />
    : null;
  const realm = health?.connected ? health.realmId : null;
  const missingMappings = !invoice.customers?.qbo_customer_id || (realm && invoice.customers.qbo_realm_id !== realm)
    || lines.some(line => line.kind === "sku" ? !line.skus?.qbo_item_id || (realm && line.skus.qbo_realm_id !== realm) : /keg_deposit/.test(line.kind) ? !health?.depositItemId : line.kind === "one_way_keg_fee" && !health?.oneWayFeeItemId);
  const presentation = qboInvoicePresentation({ kind: invoice.kind, roles: brewery.roles, connected: Boolean(health?.connected), syncStatus: invoice.qbo_sync_status, hasPendingPush, syncError: invoice.qbo_sync_error, remoteState: invoice.qbo_remote_state, balanceCents: invoice.qbo_balance_cents, cashCollectedCents: invoice.qbo_cash_collected_cents, totalCents: invoice.qbo_total_cents, accountantDrift: invoice.qbo_accountant_drift, writtenOff: Boolean(invoice.written_off_at), missingMappings: Boolean(missingMappings) });
  const mappings = !credit && realm && (brewery.roles.includes("admin") || brewery.roles.includes("sales"))
    ? invoiceMappingRows(invoice.customers, lines, realm, health?.depositItemId, `/invoices/${invoice.id}/mapping`, brewery.roles.includes("admin") ? "/settings/accounting/mappings" : undefined, health?.oneWayFeeItemId) : undefined;
  const model = toInvoiceViewProps({ invoice, lines, questions, mappings, backHref: "/invoices", timeZone: brewery.timeZone });
  return (
    <InvoiceView
      model={model}
      staffLink={quickbooksLink}
      correction={memo}
      questionAction={(q) => <MarkAnswered questionId={q.id} />}
      quickbooks={{ detail: presentation.detail }}
      accountingActions={<QboInvoiceActions invoiceId={invoice.id} invoiceLabel={model.title} actions={presentation.actions} />}
    />
  );
}
