// components/mgr/views/return-credit.tsx — Return and credit drawing. Inventory
// mounts this view. Live create/edit stays credit-memo-form.tsx (CommandForm;
// E.stq / E.pick are not controlled inputs).
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ReturnCreditViewModel } from "@/lib/mgr/return-credit-view";

export type { ReturnCreditViewModel };

export function ReturnCreditView({
  model,
  footer,
  tape,
  reason = 0,
}: {
  model: ReturnCreditViewModel;
  footer?: ReactNode;
  tape?: [ReactNode, ReactNode?][];
  reason?: number;
}) {
  return (
    <>
      {E.back(model.backTo, model.title, undefined, model.backHref)}
      {model.lines.map((line) => (
        <Fragment key={line.key}>{E.row(line.name, line.detail, E.stq(line.qty))}</Fragment>
      ))}
      {E.chips(model.reasons, reason)}
      {E.pick("Return to", model.returnTo, model.returnToOptions)}
      {model.depositLabel && model.depositAmount
        ? E.row("Deposit refund", model.depositLabel, model.depositAmount)
        : null}
      {E.info(model.creditInfo)}
      {E.tape(tape ?? model.tape)}
      {E.note(model.note)}
      {E.sp()}
      {footer ?? E.btn("Return shipment", "irr")}
    </>
  );
}
