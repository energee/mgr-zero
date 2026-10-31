// Pay invoice, Payment unavailable and Paid invoice share this drawing.
// Live supplies the POST action and question form; inventory uses the same
// payment control without an active submission target.
import { type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { portalInvoiceStatusTone, type PortalInvoiceViewModel } from "@/lib/mgr/portal-invoice-view";

export type PortalInvoiceVariant = "pay" | "unavailable" | "paid";
type ResolvedPortalInvoiceVariant = PortalInvoiceVariant | "nonpayable";

function resolveVariant(variant: PortalInvoiceVariant | undefined, paid: boolean, payable: boolean): ResolvedPortalInvoiceVariant {
  if (variant) return variant;
  if (!paid && !payable) return "nonpayable";
  return paid ? "paid" : "unavailable";
}

export function PortalInvoiceView({
  model,
  variant,
  question,
  paymentAction,
}: {
  model: PortalInvoiceViewModel;
  /** Explicit payment outcome; otherwise derive the current document state. */
  variant?: PortalInvoiceVariant;
  /** Live: QuestionForm. Inventory default is the Question this invoice nav. */
  question?: ReactNode;
  /** Live POST broker; inventory leaves the payment control inert. */
  paymentAction?: string;
}) {
  const kind = model.kind === "credit_memo" ? "credit" : resolveVariant(variant, model.paid, model.payable);
  const questionNav = E.nav("Question this invoice", `sends a note to ${model.breweryName}`);
  const questionSlot = question !== undefined ? question : questionNav;
  return (
    <>
      {E.back("Invoices", model.title, undefined, model.backHref)}
      {E.ttl(model.total)}
      {E.fld("Issued", model.issued)}
      {E.row("Status", model.status, "", portalInvoiceStatusTone[model.status])}
      {kind === "unavailable"
        ? E.info("Online payment isn’t available for this invoice right now.")
        : null}
      {kind === "nonpayable" ? E.info(model.status === "Unpaid" ? "Online payment isn’t available for this invoice right now." : model.status === "Review" ? "QuickBooks changes need review before online payment is available." : "This invoice is not payable.") : null}
      {/* Optional paidOn slot remains compatible; the current adapter supplies no settlement date. */}
      {kind === "paid"
        ? (model.paidOn ? E.row("Paid", model.paidOn, "", "ok") : null)
        : kind === "pay" || kind === "unavailable" ? (
          <>
            {model.due ? E.row("Due", model.due) : null}
          </>
        ) : null}
      {E.tbl(["Item", "Qty", "Amount"], model.lines.map((l) => [l.item, l.qty, l.amount]), ["l", "r", "r"])}
      {kind === "pay" ? (
        <>
          {E.info("Pay by card or bank transfer through QuickBooks. You will not need an account.")}
          {/* Keep Origin on the same-origin POST; the broker response removes the external referrer. */}
          <form method="post" action={paymentAction} target="_blank" rel="noopener" className="flex flex-col">
            {E.btn("Pay invoice", "p", undefined, undefined, { type: paymentAction ? "submit" : "button" })}
          </form>
          {E.info("Opens QuickBooks in a new tab after you choose Pay invoice. Availability is re-checked on every payment attempt.")}
        </>
      ) : null}
      {kind === "unavailable" ? (
        <>
          {E.note(`Contact ${model.breweryName} to arrange payment. The invoice above is unchanged and still due.`)}
          {E.nav(model.breweryName, model.breweryPhone ?? "")}
        </>
      ) : null}
      {questionSlot}
    </>
  );
}
