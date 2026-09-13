// components/mgr/views/close-packaging-run.tsx — Close packaging run.
// Shared planned facts and copper review; live supplies only the next action.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ClosePackagingRunViewModel } from "@/lib/mgr/close-packaging-run-view";

export type { ClosePackagingRunViewModel };

export function ClosePackagingRunView({
  model,
  action,
}: {
  model: ClosePackagingRunViewModel;
  action?: ReactNode;
}) {
  return (
    <>
      {E.back(model.backTo ?? "Work", model.title, undefined, model.backHref)}
      {model.brand !== undefined ? E.fld("Brand", model.brand) : null}
      {model.plannedOn !== undefined ? E.fld("Planned", model.plannedOn) : null}
      {model.plannedOutputs ? <>{E.fld("Source", model.source ?? "no source yet")}{E.ttl("Planned outputs")}{E.tbl(["SKU", "planned", "actual"], model.plannedOutputs)}</> : null}
      {model.showCloseReview !== false ? (
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
        ) : null}
      {action}
    </>
  );
}
