// components/mgr/views/invoice.tsx — Invoice drawing. Inventory and the live
// page share returned mapping facts; adapters supply authorized action controls.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { money } from "@/lib/mgr/money";
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
  quickbooks,
  accountingActions,
}: {
  model: InvoiceViewModel;
  headerAction?: ReactNode;
  questionAction?: ReactNode | ((question: InvoiceQuestionView) => ReactNode);
  mappings?: InvoiceViewModel["mappings"];
  pushDisabled?: boolean;
  qbo?: ReactNode;
  /** Live QuickBooks row, or a gate message while integration is unavailable. */
  qboGate?: ReactNode;
  quickbooks?: { detail: string; balanceCents: number | null; healthy: boolean };
  accountingActions?: ReactNode;
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
      {qbo !== undefined ? qbo : (typeof qboGate === "string" ? E.gated("QuickBooks", qboGate) : qboGate)}
      {qbo === undefined && quickbooks && E.row("QuickBooks", `${quickbooks.detail}${quickbooks.balanceCents != null && quickbooks.balanceCents > 0 && !quickbooks.detail.includes(money(quickbooks.balanceCents)) ? ` · ${money(quickbooks.balanceCents)} balance` : ""}`, "", quickbooks.healthy ? "ok" : "w")}
      {mappingRows?.map((row) => (
        <Fragment key={row.key}>{E.row(row.title, row.detail, row.unavailable ? E.status("Mapping unavailable", "w") : E.act("Fix", "attention", row.href), row.tone ?? "")}</Fragment>
      ))}
      {mappingRows?.some(row => row.tone === "w") ? E.info("Push becomes available after every customer and item has a QuickBooks match.") : null}
      {model.questions.map((q) => (
        <Fragment key={q.key}>
          {E.row("Buyer asked about this invoice", q.detail, q.answered ? "answered" : unanswered(q), q.answered ? "ok" : "w")}
        </Fragment>
      ))}
      {qbo === undefined && (accountingActions !== undefined ? accountingActions : mappingRows?.length ? E.btn("Push invoice to QuickBooks Online", pushDisabled ? "irr disabled" : "irr") : null)}
    </>
  );
}
