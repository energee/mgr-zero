// Transfer detail owns the complete document, including its shared actions.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { TransferDetailViewModel } from "@/lib/mgr/transfer-detail-view";
import { TransferActionsView, type TransferActionBindings } from "@/components/mgr/views/transfer-actions";

export function TransferDetailView({
  model,
  footer,
  actions,
}: {
  model: TransferDetailViewModel;
  footer?: ReactNode;
  actions?: TransferActionBindings;
}) {
  return (
    <>
      {E.back("Transfers", model.title, undefined, model.backHref)}
      {E.fld("From", model.from)}
      {E.fld("To", model.to)}
      {E.fld("Status", model.status)}
      {model.note ? E.fld("Note", model.note) : null}
      {model.cancelReason ? E.fld("Cancel reason", model.cancelReason) : null}
      {model.lines.map((line) => (
        <div key={line.key}>{E.row(line.title, line.detail, line.qty, model.received ? "ok" : "")}</div>
      ))}
      {footer !== undefined
        ? footer
        : model.received
          ? E.info("Received: the paired movements are on the ledger. No invoice: this is an internal move.")
          : model.nextVerb
            ? (
              <>
                {E.sp()}
                <TransferActionsView lines={model.sources ?? []} {...actions} />
              </>
            )
            : null}
    </>
  );
}
