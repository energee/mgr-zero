// app/(app)/invoices/page.tsx — the AR list and its current QuickBooks state.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { docNo } from "@/lib/mgr/doc-no";
import { money } from "@/lib/mgr/money";
import { invoiceCurrentState } from "@/lib/mgr/invoice-state";
import { qboInvoicePresentation } from "@/lib/mgr/qbo-ui";
import "@/lib/commands/all";
import { QboSyncButton } from "@/app/(app)/settings/accounting/qbo-controls";

type Invoice = { id: string; invoice_no: number | null; kind: "invoice" | "credit_memo"; due_on: string | null; paid_at: string | null; qbo_sync_status: "pending" | "pushed" | "push_failed"; qbo_sync_error: string | null; qbo_remote_state: "live" | "voided" | "deleted"; qbo_balance_cents: number | null; qbo_accountant_drift: boolean; written_off_at: string | null; subtotal_cents: number; total_cents: number; has_pending_qbo_push: boolean; customers: { name: string } | null };

export default async function InvoicesPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const canManage = brewery.role === "admin" || brewery.role === "sales";
  const [invoices, health] = await Promise.all([
    runCommand("list_invoices", {}, ctx) as Promise<Invoice[]>,
    canManage ? runCommand("get_qbo_connection", {}, ctx) as Promise<{ connected: boolean; state: string; realmLabel: string | null }> : null,
  ]);
  return (
    <>
      {E.back("More", "Invoices", undefined, "/more")}
      {canManage && health ? E.row("QuickBooks", health.connected ? `connected · ${health.realmLabel ?? "verified company"}` : health.state.replaceAll("_", " "), health.connected ? <QboSyncButton /> : brewery.role === "admin" ? E.act("Connect", "attention", "/settings/accounting/connect") : "Admin must connect", health.connected ? "ok" : "w") : E.fld("QuickBooks", "Financial actions require Admin or Sales")}
      {invoices.length === 0 ? E.blank("No invoices yet") : invoices.map((inv) => {
        const credit = inv.kind === "credit_memo";
        const state = invoiceCurrentState(inv);
        const paid = state === "paid";
        const status = state === "written_off" ? "written off" : state;
        const qbo = qboInvoicePresentation({ kind: inv.kind, role: brewery.role, connected: Boolean(health?.connected), syncStatus: inv.qbo_sync_status, hasPendingPush: inv.has_pending_qbo_push, syncError: inv.qbo_sync_error, remoteState: inv.qbo_remote_state, balanceCents: inv.qbo_balance_cents, totalCents: inv.total_cents, accountantDrift: inv.qbo_accountant_drift, writtenOff: Boolean(inv.written_off_at) });
        const detail = inv.qbo_sync_status === "pushed" && !inv.qbo_accountant_drift && state === "unpaid"
          ? qbo.detail : inv.qbo_sync_status !== "pushed" ? qbo.detail : paid ? `paid ${new Date(inv.paid_at!).toLocaleDateString()}` : status;
        return (
          <div key={inv.id}>{E.row(`${docNo(credit ? "CM" : "INV", inv.invoice_no, credit ? "Credit memo" : "Invoice")} · ${inv.customers?.name ?? "—"}`,
            credit ? `credit memo · ${money(inv.total_cents)}` : `${detail}${state === "unpaid" && inv.due_on ? ` · due ${inv.due_on}` : ""} · ${money(inv.total_cents)}`,
            E.act("Open", "primary", `/invoices/${inv.id}`), paid || credit || state === "written_off" ? "ok" : state === "unpaid" ? "" : "w")}</div>
        );
      })}
    </>
  );
}
