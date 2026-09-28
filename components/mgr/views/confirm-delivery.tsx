// components/mgr/views/confirm-delivery.tsx — Confirm delivery. Live slots
// DeliveredForm; inventory and live share the outcome controls.
"use client";

import { Fragment, useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ConfirmDeliveryViewModel } from "@/lib/mgr/confirm-delivery-view";
import { REFUSAL_REASONS } from "@/lib/mgr/enums";

const REFUSAL_LABEL: Record<(typeof REFUSAL_REASONS)[number], string> = {
  customer_refused: "Customer refused", closed: "Closed / no access", damaged: "Damaged in transit", wrong_item: "Wrong item", other: "Other",
};

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
      {action ?? <DeliveryOutcomeForm lines={model.lines} initialSignedBy={model.receivedBy} receivedSuggestions={model.receivedSuggestions} />}
    </>
  );
}

export function DeliveryOutcomeForm({ lines, transfer = false, initialSignedBy = "", receivedSuggestions, busy, error, onSubmit }: {
  lines: { key: string; title: string; qty: string }[]; transfer?: boolean; initialSignedBy?: string; receivedSuggestions?: string[];
  busy?: boolean; error?: string | null; onSubmit?: (input: { signedBy: string; refused: { orderLineId: string; qty: number }[]; reason?: string; note: string; transferRefused: boolean }) => void;
}) {
  const [signedBy, setSignedBy] = useState(initialSignedBy);
  const [refused, setRefused] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [transferRefused, setTransferRefused] = useState(false);
  function submit() {
    onSubmit?.({ signedBy, reason: reason || undefined, note, transferRefused,
      refused: Object.entries(refused).filter(([, qty]) => qty > 0).map(([orderLineId, qty]) => ({ orderLineId, qty })),
    });
  }
  const hasRefusal = transfer ? transferRefused : Object.values(refused).some((qty) => qty > 0);
  const fullRefusal = transfer ? transferRefused : lines.length > 0 && lines.every((l) => (refused[l.key] ?? 0) === Number(l.qty));
  const disabled = busy || (!fullRefusal && !signedBy.trim()) || (hasRefusal && (!reason || (reason === "other" && !note.trim())));
  return <>
    {transfer ? E.row("Transfer refused", "Stock stays in transit", E.sw(transferRefused, "Transfer refused", setTransferRefused)) : lines.map((l) => <Fragment key={l.key}>
      {E.edit(`${l.title} · refused`, String(refused[l.key] ?? 0), "number", undefined, { min: 0, max: Number(l.qty), step: 1, onChange: (value) => setRefused({ ...refused, [l.key]: Number(value) }) })}
      {E.fld("Accepted", String(Number(l.qty) - (refused[l.key] ?? 0)))}
    </Fragment>)}
    {hasRefusal && <>
      {E.pick("Refusal reason", reason, REFUSAL_REASONS.map((value) => ({ value, label: REFUSAL_LABEL[value] })), { onChange: setReason, required: true })}
      {E.edit("Refusal note", note, "text", undefined, { onChange: setNote, required: reason === "other" })}
      {E.note("Refused beer closes on this order. Stock returns only after a physical check-in. Redelivery needs a new order.")}
    </>}
    {E.edit("Received by", signedBy, "text", receivedSuggestions, { onChange: setSignedBy, required: !fullRefusal })}
    {error && E.status(error, "w")}
    {E.btn(busy ? "Saving…" : fullRefusal ? "Record refusal" : hasRefusal ? "Record partial delivery" : "Delivered", disabled ? "irr disabled" : "irr", undefined, submit)}
  </>;
}
