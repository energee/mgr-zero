// components/mgr/views/portal-invoice.tsx — Pay invoice, Payment unavailable,
// and Paid invoice share this drawing. variant is presentation (pay /
// unavailable / paid), not fixture vs live. Live unpaid is unavailable
// (QBO Payments parked) and passes QuestionForm in question.
import { type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PortalInvoiceViewModel } from "@/lib/mgr/portal-invoice-view";

export type { PortalInvoiceViewModel };

export type PortalInvoiceVariant = "pay" | "unavailable" | "paid";

function resolveVariant(variant: PortalInvoiceVariant | undefined, paid: boolean): PortalInvoiceVariant {
  if (variant) return variant;
  return paid ? "paid" : "unavailable";
}

export function PortalInvoiceView({
  model,
  variant,
  question,
  footer,
}: {
  model: PortalInvoiceViewModel;
  /** Inventory Pay passes "pay". Omit on live unpaid (QBO parked) or paid. */
  variant?: PortalInvoiceVariant;
  /** Live: QuestionForm. Inventory default is the Question this invoice nav. */
  question?: ReactNode;
  /** Live/inventory: Pay and Download PDF. Unavailable has none by default. */
  footer?: ReactNode;
}) {
  const kind = resolveVariant(variant, model.paid);
  const questionNav = E.nav("Question this invoice", `sends a note to ${model.breweryName}`);
  const questionSlot = question !== undefined ? question : questionNav;
  const payFooter = footer ?? E.btns([["Pay invoice", "p"], ["Download PDF", "g"]]);
  const paidFooter = footer ?? E.btn("Download PDF", "g");
  return (
    <>
      {E.back("Invoices", model.title, undefined, model.backHref)}
      {E.ttl(model.total)}
      {kind === "unavailable"
        ? E.info("Online payment isn’t available for this invoice right now.")
        : null}
      {kind === "paid"
        ? (model.paidOn ? E.row("Paid", model.paidOn, "", "ok") : null)
        : (
          <>
            {model.due ? E.row("Due", model.due) : null}
            {kind === "pay" ? E.row("Status", "Unpaid", "", "w") : null}
          </>
        )}
      {E.tbl(["Item", "Qty", "Amount"], model.lines.map((l) => [l.item, l.qty, l.amount]))}
      {kind === "pay" ? (
        <>
          {E.info("Pay by card or bank transfer through QuickBooks. You will not need an account.")}
          {payFooter}
          {questionSlot}
          {E.info("Opens QuickBooks in a new tab. This link keeps working; it is re-checked each time you open it.")}
        </>
      ) : null}
      {kind === "unavailable" ? (
        <>
          {E.note(`Contact ${model.breweryName} to arrange payment. The invoice above is unchanged and still due.`)}
          {E.nav(model.breweryName, model.breweryPhone ?? "")}
          {questionSlot}
          {footer}
        </>
      ) : null}
      {kind === "paid" ? paidFooter : null}
    </>
  );
}
