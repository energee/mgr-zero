// components/mgr/views/receipt.tsx — Receipt inventory echo. Live PO page
// keeps receipts in the ReceivePoView footer.
import { E } from "@/components/mgr/e";
import type { ReceiptViewModel } from "@/lib/mgr/receipt-view";

export type { ReceiptViewModel };

export function ReceiptView({ model }: { model: ReceiptViewModel }) {
  return (
    <>
      {E.back(model.backTo ?? "Work", model.title, undefined, model.backHref)}
      {E.fld("Status", model.status)}
      {E.fld("Still owed", model.stillOwed)}
      {E.tape(model.tape)}
      {E.info(model.info)}
    </>
  );
}
