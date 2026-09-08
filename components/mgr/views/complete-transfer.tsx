// components/mgr/views/complete-transfer.tsx — Complete transfer drawing.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { formatVolume } from "@/lib/volume";
import type { CompleteTransferViewModel } from "@/lib/mgr/complete-transfer-view";

export type { CompleteTransferViewModel };

export const COMPLETE_TRANSFER_EXEMPLAR: CompleteTransferViewModel = {
  backTo: "TRF-0088",
  fromLabel: "Warehouse",
  toLabel: "Taproom",
  lines: [
    { key: "pils", name: "Pils · 16 oz case", detail: "4 / 4", tone: "ok" },
    { key: "hazy", name: "Hazy IPA · ½ bbl keg", detail: "2 / 2", tone: "ok" },
  ],
  tape: [
    ["−4 Pils cases · taproom transfer · Warehouse", formatVolume("0.39")],
    ["+4 Pils cases · taproom transfer · Taproom", formatVolume("0.39")],
    ["−2 / +2 Hazy ½ bbl · taproom transfer", formatVolume("1.00")],
  ],
  showFixtureButton: true,
};

export function CompleteTransferView({ model, footer }: { model: CompleteTransferViewModel; footer?: ReactNode }) {
  return (
    <>
      {E.back(model.backTo, "Complete transfer", undefined, model.backHref)}
      {E.fld(<>From {E.arrow(null)} to</>, <>{model.fromLabel} {E.arrow()} {model.toLabel}</>)}
      {model.lines.map((line) => (
        <Fragment key={line.key}>{E.row(line.name, "move / picked", line.detail, line.tone ?? "")}</Fragment>
      ))}
      {model.tape ? E.tape(model.tape) : null}
      {E.info("No invoice: this is an internal move.")}
      {E.sp()}
      {footer ?? (model.showFixtureButton ? E.btn("Complete transfer", "irr") : null)}
    </>
  );
}
