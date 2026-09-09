// components/mgr/views/run-closed.tsx — Run closed. Live slots ledger facts;
// inventory draws lot / output / yield and Print labels.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { RunClosedViewModel } from "@/lib/mgr/run-closed-view";

export type { RunClosedViewModel };

export function RunClosedView({
  model,
  fields,
  action,
}: {
  model: RunClosedViewModel;
  fields?: ReactNode;
  action?: ReactNode | null;
}) {
  return (
    <>
      {E.back(model.backTo ?? "Work", model.title, undefined, model.backHref)}
      {fields ?? (
        <>
          {E.fld("Lot", model.lot ?? "")}
          {E.fld("Output", model.output ?? "")}
          {E.fld("Yield", model.yield ?? "")}
        </>
      )}
      {action !== undefined ? action : E.btn("Print labels")}
    </>
  );
}
