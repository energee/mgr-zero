// components/mgr/views/invoice.tsx — Invoice drawing. Inventory and the live
// page both pass toInvoiceViewProps(get_invoice + questions). Mapping rows and
// the disabled push draw when the fixture includes them; live passes
// headerAction, questionAction, and a qbo slot instead.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { InvoiceQuestionView, InvoiceViewModel } from "@/lib/mgr/invoice-view";

export type { InvoiceViewModel };

export function InvoiceView({
  model,
  headerAction,
  questionAction,
  mappings = model.mappings,
  pushDisabled = true,
  qbo,
  qboGate,
}: {
  model: InvoiceViewModel;
  headerAction?: ReactNode;
  questionAction?: ReactNode | ((question: InvoiceQuestionView) => ReactNode);
  mappings?: InvoiceViewModel["mappings"];
  pushDisabled?: boolean;
  qbo?: ReactNode;
  /** Live: QuickBooks mapping/push is not connected. Inventory omits this. */
  qboGate?: string;
}) {
  const mappingRows = qbo !== undefined || qboGate ? undefined : mappings;
  const unanswered = (q: InvoiceQuestionView) => {
    if (typeof questionAction === "function") return questionAction(q);
    return questionAction !== undefined ? questionAction : E.act("Mark answered", "success");
  };
  return (
    <>
      {E.back("Invoices", model.title, headerAction, model.backHref)}
      {E.row(model.customer, model.summary, model.total, model.headerTone)}
      {model.lines.map((line) => (
        <Fragment key={line.key}>{E.row(line.name, line.detail, line.amount)}</Fragment>
      ))}
      {qbo !== undefined ? qbo : (qboGate ? E.gated("QuickBooks", qboGate) : null)}
      {mappingRows?.map((row) => (
        <Fragment key={row.key}>{E.row(row.title, row.detail, E.act("Fix", "attention"), row.tone ?? "")}</Fragment>
      ))}
      {mappingRows?.length ? E.info("Push becomes available after every customer and item has a QuickBooks match.") : null}
      {model.questions.map((q) => (
        <Fragment key={q.key}>
          {E.row("Buyer asked about this invoice", q.detail, q.answered ? "answered" : unanswered(q), q.answered ? "ok" : "w")}
        </Fragment>
      ))}
      {mappingRows?.length ? E.btn("Push invoice to QuickBooks Online", pushDisabled ? "irr disabled" : "irr") : null}
    </>
  );
}
