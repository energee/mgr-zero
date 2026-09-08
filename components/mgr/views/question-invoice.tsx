// components/mgr/views/question-invoice.tsx — Question invoice sheet drawing
// (inventory). Live QuestionForm stays a CommandForm wrapper; this view is
// the inventory fields and send button.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { QuestionInvoiceViewModel } from "@/lib/mgr/question-invoice-view";

export type { QuestionInvoiceViewModel };

export function QuestionInvoiceView({
  model,
  footer,
}: {
  model: QuestionInvoiceViewModel;
  footer?: ReactNode;
}) {
  return (
    <>
      {E.fld("Invoice", model.label)}
      {E.inp("What’s wrong with this invoice?")}
      {footer ?? E.btn(`Send to ${model.breweryName}`)}
    </>
  );
}
