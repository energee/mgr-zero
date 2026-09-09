// components/mgr/views/confirm-delivery.tsx — Confirm delivery. Live slots
// DeliveredForm; inventory draws Received by and Delivered.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ConfirmDeliveryViewModel } from "@/lib/mgr/confirm-delivery-view";

export type { ConfirmDeliveryViewModel };

export function ConfirmDeliveryView({
  model,
  action,
}: {
  model: ConfirmDeliveryViewModel;
  action?: ReactNode;
}) {
  return (
    <>
      {E.back(model.backTo ?? "Driver route", model.title, undefined, model.backHref)}
      {E.ttl(model.heading)}
      {model.shipTo && E.fld("Ship to", model.shipTo)}
      {E.fld("Invoice timing", model.invoiceTiming)}
      {model.lines.map((row) => (
        <Fragment key={row.key}>{E.row(row.title, "", row.qty)}</Fragment>
      ))}
      {action ?? (
        <>
          {E.edit("Received by", model.receivedBy ?? "", "text", model.receivedSuggestions)}
          {E.sp()}
          {E.btn("Delivered", "irr")}
        </>
      )}
    </>
  );
}
