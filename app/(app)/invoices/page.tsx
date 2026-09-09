// app/(app)/invoices/page.tsx — the AR list (screen record Invoices, minus
// its QuickBooks rows until Program 13): every invoice and credit memo with
// its customer, current total and paid date, each opening Invoice. The query
// also retains the frozen local subtotal for audit.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { docNo } from "@/lib/mgr/doc-no";
import { money } from "@/lib/mgr/money";
import { invoiceCurrentState } from "@/lib/mgr/invoice-state";
import "@/lib/commands/all";

type Invoice = { id: string; invoice_no: number | null; kind: "invoice" | "credit_memo"; due_on: string | null; paid_at: string | null; qbo_remote_state: "live" | "voided" | "deleted"; qbo_balance_cents: number | null; written_off_at: string | null; subtotal_cents: number; total_cents: number; customers: { name: string } | null };

export default async function InvoicesPage() {
  const brewery = await getActiveBrewery();
  const invoices = (await runCommand("list_invoices", {}, await buildContext(brewery.id))) as Invoice[];
  return (
    <>
      {E.back("More", "Invoices", undefined, "/more")}
      {E.gated("QuickBooks", "accounting sync isn’t connected yet")}
      {invoices.length === 0 ? E.blank("No invoices yet") : invoices.map((inv) => {
        const credit = inv.kind === "credit_memo";
        const state = invoiceCurrentState(inv);
        const paid = state === "paid";
        const status = state === "written_off" ? "written off" : state;
        return (
          <div key={inv.id}>{E.row(`${docNo(credit ? "CM" : "INV", inv.invoice_no, credit ? "Credit memo" : "Invoice")} · ${inv.customers?.name ?? "—"}`,
            credit ? `credit memo · ${money(inv.total_cents)}` : paid ? `paid ${new Date(inv.paid_at!).toLocaleDateString()} · ${money(inv.total_cents)}` : state === "unpaid" ? `${inv.due_on ? `due ${inv.due_on}` : "unpaid"} · ${money(inv.total_cents)}` : `${status} · ${money(inv.total_cents)}`,
            E.act("Open", "primary", `/invoices/${inv.id}`), paid || credit || state === "written_off" ? "ok" : state === "unpaid" ? "" : "w")}</div>
        );
      })}
    </>
  );
}
