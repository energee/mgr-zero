// lib/mgr/question-invoice-view.ts — view-model for the Question invoice sheet.
// Live QuestionForm stays a CommandForm wrapper; this paints the inventory
// fields from a portal_invoice snapshot.
import { docNo } from "./doc-no";
import { money } from "./money";

export type QuestionInvoiceViewModel = {
  label: string;
  breweryName: string;
};

export type QuestionInvoiceSnapshot = {
  invoice: {
    invoice_no: number | null;
    kind: "invoice" | "credit_memo";
    total_cents: number;
  };
  brewery: { name: string };
};

/** Map portal_invoice onto the Question invoice sheet. */
export function toQuestionInvoiceViewProps({ invoice, brewery }: QuestionInvoiceSnapshot): QuestionInvoiceViewModel {
  const credit = invoice.kind === "credit_memo";
  const no = docNo(credit ? "CM" : "INV", invoice.invoice_no, credit ? "Credit memo" : "Invoice");
  return {
    label: `${no} · ${money(invoice.total_cents)}`,
    breweryName: brewery.name,
  };
}
