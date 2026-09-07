// app/(portal)/portal/invoices/[id]/page.tsx — one invoice or credit memo
// for the signed-in customer (portal_invoice), drawn to the Pay invoice
// screen record minus the payment itself: QuickBooks Payments is parked, so
// an unpaid invoice says how to pay instead of offering a dead Pay button.
import { E } from "@/components/mgr/e";
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";

type Detail = {
  invoice: { id: string; invoice_no: number | null; kind: "invoice" | "credit_memo"; issued_on: string; due_on: string | null; paid_at: string | null; total_cents: number };
  lines: { id: string; kind: string; qty: number; amount_cents: number; description: string | null; skus: { name: string } | null }[];
};
const money = (cents: number) => `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export default async function PortalInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getActiveCustomer();
  const ctx = await buildContext(customer.breweryId);
  const { invoice, lines } = await orNotFound(runCommand("portal_invoice", { invoiceId: id }, ctx) as Promise<Detail>);
  const no = invoice.invoice_no ? `${invoice.kind === "credit_memo" ? "CM" : "INV"}-${String(invoice.invoice_no).padStart(4, "0")}` : invoice.kind === "credit_memo" ? "Credit memo" : "Invoice";
  const paid = invoice.paid_at !== null;
  return (
    <>
      {E.back("Invoices", no, undefined, "/portal/invoices")}
      {E.ttl(money(invoice.total_cents))}
      {E.row("Issued", invoice.issued_on)}
      {invoice.due_on ? E.row("Due", invoice.due_on) : null}
      {invoice.kind === "invoice" ? E.row("Status", paid ? `Paid ${new Date(invoice.paid_at!).toLocaleDateString()}` : "Unpaid", "", paid ? "ok" : "w") : E.row("Status", "Credit", "", "ok")}
      {E.tbl(["Item", "Qty", "Amount"], lines.map((l) => [l.skus?.name ?? l.description ?? l.kind, String(Number(l.qty)), money(l.amount_cents)]))}
      {invoice.kind === "invoice" && !paid ? E.info("Contact the brewery to pay this invoice.") : null}
    </>
  );
}
