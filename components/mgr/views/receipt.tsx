// Shared receipt confirmation; the live adapter selects a committed receipt.
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
      {model.revisions?.map(revision => <div key={revision.label}>{E.nav(revision.label, "Receipt history", "", undefined, revision.href)}</div>)}
      {model.correction && E.act("Correct receipt", "attention", model.correction.href)}
    </>
  );
}
