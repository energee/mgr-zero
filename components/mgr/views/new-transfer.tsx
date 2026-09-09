// components/mgr/views/new-transfer.tsx — New transfer sheet (inventory). Live
// create stays new-transfer-form.tsx: E.pick / E.stq are not a controlled CommandForm.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { NewTransferViewModel } from "@/lib/mgr/new-transfer-view";

export type { NewTransferViewModel };

export function NewTransferView({
  model,
  footer,
}: {
  model: NewTransferViewModel;
  footer?: ReactNode;
}) {
  return (
    <>
      {E.back("Transfers", "New transfer")}
      {E.pick("From", model.from, model.fromOptions)}
      {E.pick("From bin", model.fromBin, model.fromBinOptions)}
      {E.pick("To", model.to, model.toOptions)}
      {E.pick("To bin", model.toBin, model.toBinOptions)}
      {model.lines.map((line) => (
        <div key={line.title}>{E.row(line.title, "", E.stq(line.qty))}</div>
      ))}
      {footer !== undefined ? footer : E.btn("Create transfer")}
    </>
  );
}
