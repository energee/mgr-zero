// components/mgr/views/receive-po.tsx — Receive PO. Live slots status, lines
// table, and MarkSentForm / ReceiveForm; inventory draws counts and the tape.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ReceivePoViewModel } from "@/lib/mgr/receive-po-view";

export type { ReceivePoViewModel };

export function ReceivePoView({
  model,
  lead,
  review,
  action,
  footer,
}: {
  model: ReceivePoViewModel;
  lead?: ReactNode;
  review?: ReactNode | null;
  action?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      {E.back("Purchase orders", model.title, undefined, model.backHref)}
      {lead ?? (model.status ? E.fld("Status", model.status) : null)}
      {review !== undefined
        ? review
        : (model.lines ?? []).map((line) => (
          <Fragment key={line.key}>
            {line.lot
              ? E.line(line.title, line.detail, E.stq(line.qty), line.warning ? "w" : "", <>
                {E.edit("Lot", line.lot, "text", line.lotOptions)}
                {line.bestBy ? E.edit("Best by", line.bestBy, "date") : null}
                {line.note ? E.note(line.note) : null}
              </>)
              : E.row(line.title, line.detail, E.stq(line.qty), line.ok ? "ok" : line.warning ? "w" : "")}
          </Fragment>
        ))}
      {review === undefined ? (
        <>
          {E.tape(model.tape ?? [])}
          {model.info ? E.info(model.info) : null}
          {E.sp()}
          {E.btn("Receive purchase order", "irr")}
        </>
      ) : null}
      {action}
      {footer}
    </>
  );
}
