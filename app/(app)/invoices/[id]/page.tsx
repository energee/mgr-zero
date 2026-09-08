// app/(app)/invoices/[id]/page.tsx — Invoice (screen record): one invoice or
// credit memo with its lines and total, the buyer's questions about it with
// Mark answered (resolve_invoice_question, mark-answered.tsx), and for an
// invoice a credit memo against a subset of lines (credit-memo-form.tsx).
// The QuickBooks mappings and push wait for Program 13. An unknown or
// malformed id renders not-found.tsx.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { docNo } from "@/lib/mgr/doc-no";
import { money } from "@/lib/mgr/money";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { CreditMemoForm } from "./credit-memo-form";
import { MarkAnswered } from "./mark-answered";

type Invoice = { id: string; invoice_no: number | null; kind: "invoice" | "credit_memo"; issued_on: string; due_on: string | null; paid_at: string | null; customers: { name: string } | null };
type InvoiceLine = { id: string; qty: number; unit_price_cents: number; amount_cents: number; description: string; skus: { name: string } | null };
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
  const no = docNo(credit ? "CM" : "INV", invoice.invoice_no, credit ? "Credit memo" : "Invoice");
  const total = lines.reduce((sum, l) => sum + l.amount_cents, 0);
  const memo = !credit && brewery.role !== "warehouse"
    ? <CreditMemoForm invoiceId={invoice.id} lines={lines.map((l) => ({ id: l.id, label: l.skus?.name ?? l.description, qty: Number(l.qty) }))} locations={locations.map((l) => ({ id: l.id, name: l.name }))} />
    : undefined;
  return (
    <>
      {E.back("Invoices", no, memo, "/invoices")}
      {E.row(invoice.customers?.name ?? "—", `${invoice.due_on ? `due ${invoice.due_on}` : `issued ${invoice.issued_on}`} · ${lines.length} line${lines.length === 1 ? "" : "s"}${invoice.paid_at ? ` · paid ${new Date(invoice.paid_at).toLocaleDateString()}` : ""}`, money(total), invoice.paid_at || credit ? "ok" : "")}
      {lines.map((l) => <div key={l.id}>{E.row(l.skus?.name ?? l.description, `${Number(l.qty)} × ${money(l.unit_price_cents)}`, money(l.amount_cents))}</div>)}
      {E.gated("QuickBooks", "mapping and push aren’t connected yet")}
      {questions.map((q) => (
        <div key={q.id}>{E.row("Buyer asked about this invoice", `“${q.body}” · ${q.customers?.name ?? "buyer"}, ${new Date(q.created_at).toLocaleDateString()}`, q.answered_at ? "answered" : <MarkAnswered questionId={q.id} />, q.answered_at ? "ok" : "w")}</div>
      ))}
    </>
  );
}
