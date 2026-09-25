// components/mgr/views/transfer-detail.tsx — Transfer detail. Live slots
// TransferActions as footer; inventory draws the next verb from status, and
// Cancel transfer beside it until the transfer is received or cancelled.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { TransferDetailViewModel } from "@/lib/mgr/transfer-detail-view";

export type { TransferDetailViewModel };

export function TransferDetailView({
  model,
  footer,
}: {
  model: TransferDetailViewModel;
  footer?: ReactNode;
}) {
  return (
    <>
      {E.back("Transfers", model.title, undefined, model.backHref)}
      {E.fld(<>From {E.arrow(null)} to</>, <>{model.from} {E.arrow()} {model.to}</>)}
      {E.fld("Status", model.status)}
      {model.note ? E.fld("Note", model.note) : null}
      {model.cancelReason ? E.fld("Cancelled", model.cancelReason) : null}
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
                {E.btn(model.nextVerb)}
                {E.btn("Cancel transfer", "g")}
              </>
            )
            : null}
    </>
  );
}
