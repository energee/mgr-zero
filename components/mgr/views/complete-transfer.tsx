// components/mgr/views/complete-transfer.tsx — Complete transfer drawing.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { CompleteTransferViewModel } from "@/lib/mgr/complete-transfer-view";

export type { CompleteTransferViewModel };

export function CompleteTransferView({
  model,
  footer,
  tape,
}: {
  model: CompleteTransferViewModel;
  footer?: ReactNode;
  tape?: [ReactNode, ReactNode?][];
}) {
  return (
    <>
      {E.back(model.backTo, "Complete transfer", undefined, model.backHref)}
      {E.fld(<>From {E.arrow(null)} to</>, <>{model.fromLabel} {E.arrow()} {model.toLabel}</>)}
      {model.lines.map((line) => (
        <Fragment key={line.key}>{E.row(line.name, "move / picked", line.detail, line.tone ?? "")}</Fragment>
      ))}
      {tape ? E.tape(tape) : null}
      {E.info("No invoice: this is an internal move.")}
      {E.sp()}
      {footer ?? E.btn("Complete transfer", "irr")}
    </>
  );
}
