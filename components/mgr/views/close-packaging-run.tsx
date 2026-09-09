// components/mgr/views/close-packaging-run.tsx — Close packaging run.
// Live slots planned facts and the next-state form; inventory draws the
// copper review.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ClosePackagingRunViewModel } from "@/lib/mgr/close-packaging-run-view";

export type { ClosePackagingRunViewModel };

export function ClosePackagingRunView({
  model,
  lead,
  review,
  action,
}: {
  model: ClosePackagingRunViewModel;
  lead?: ReactNode;
  review?: ReactNode | null;
  action?: ReactNode;
}) {
  return (
    <>
      {E.back(model.backTo ?? "Work", model.title, undefined, model.backHref)}
      {lead}
      {review !== undefined
        ? review
        : (
          <>
            {E.fld("Packaging source", model.source ?? "")}
            {E.tbl(["need", "have", "short"], (model.needRows ?? []).map(([need, have, short]) => [
              need, have, short === "0" ? short : <span className="text-warning-foreground">{short}</span>,
            ]))}
            {E.note(model.shortNote ?? "")}
            {E.fld("Packaged", model.packaged ?? "")}
            {E.pick("Lot", model.lot ?? "", model.lotOptions ?? [])}
            {E.pick("Finished goods destination", model.destination ?? "", model.destinationOptions ?? [])}
            {E.edit("Labels damaged · optional", model.labelsDamaged ?? "", "number")}
            {E.edit("Ends damaged · optional", model.endsDamaged ?? "", "number")}
            {E.pick("Write off to", model.writeOff ?? "", model.writeOffOptions ?? [])}
            {E.tape(model.tape ?? [])}
            {E.btn("Close packaging run", "irr")}
          </>
        )}
      {action}
    </>
  );
}
