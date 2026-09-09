// components/mgr/views/denied.tsx — Permission denied. Live maps deniedCopy.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { DeniedViewModel } from "@/lib/mgr/denied-view";

export type { DeniedViewModel };

export function DeniedView({
  model,
  actions,
}: {
  model: DeniedViewModel;
  actions?: ReactNode;
}) {
  return (
    <>
      {E.back("Today", "No access", undefined, model.backHref)}
      {E.note(model.note)}
      {E.fld("Signed in as", model.signedInAs)}
      {E.fld("Needs", model.needs)}
      {E.info(model.hint)}
      {actions ?? E.btns([["Back to Today", "p"], ["Go to Beer", "g"]])}
      {E.sp()}
    </>
  );
}
