// components/mgr/views/confirm-delivery.tsx — Confirm delivery. Live slots
// DeliveredForm; inventory and live share the outcome controls.
"use client";

import { Fragment, useState, type ReactNode } from "react";
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
      {action ?? <DeliveryOutcomeForm lines={model.lines} initialSignedBy={model.receivedBy} receivedSuggestions={model.receivedSuggestions} />}
    </>
  );
}

export function DeliveryOutcomeFields({ lines, signedBy = "", refused = {}, reason = "", note = "", transfer = false, transferRefused = false, busy = false, error,
  onSignedBy, onRefused, onReason, onNote, onTransferRefused, onSubmit, receivedSuggestions,
}: {
  lines: { key: string; title: string; qty: string }[]; signedBy?: string; refused?: Record<string, number>; reason?: string; note?: string;
  receivedSuggestions?: string[]; transfer?: boolean; transferRefused?: boolean; busy?: boolean; error?: string | null;
  onSignedBy?: (value: string) => void; onRefused?: (key: string, qty: number) => void;
  onReason?: (value: string) => void; onNote?: (value: string) => void; onTransferRefused?: (value: boolean) => void; onSubmit?: () => void;
}) {
  const hasRefusal = transfer ? transferRefused : Object.values(refused).some((qty) => qty > 0);
  const fullRefusal = transfer ? transferRefused : lines.length > 0 && lines.every((l) => (refused[l.key] ?? 0) === Number(l.qty));
  const disabled = busy || (!fullRefusal && !signedBy.trim()) || (hasRefusal && (!reason || (reason === "other" && !note.trim())));
  return <>
    {transfer ? E.row("Transfer refused", "Stock stays in transit", E.sw(transferRefused, "Transfer refused", onTransferRefused)) : lines.map((l) => <Fragment key={l.key}>
      {E.edit(`${l.title} · refused`, String(refused[l.key] ?? 0), "number", undefined, { min: 0, max: Number(l.qty), step: 1, onChange: onRefused ? (value) => onRefused(l.key, Number(value)) : undefined })}
      {E.fld("Accepted", String(Number(l.qty) - (refused[l.key] ?? 0)))}
    </Fragment>)}
    {hasRefusal && <>
      {E.pick("Refusal reason", reason, [{ value: "customer_refused", label: "Customer refused" }, { value: "closed", label: "Closed / no access" }, { value: "damaged", label: "Damaged in transit" }, { value: "wrong_item", label: "Wrong item" }, { value: "other", label: "Other" }], { onChange: onReason, required: true })}
      {E.edit("Refusal note", note, "text", undefined, { onChange: onNote, required: reason === "other" })}
      {E.note("Refused beer closes on this order. Stock returns only after a physical check-in. Redelivery needs a new order.")}
    </>}
    {E.edit("Received by", signedBy, "text", receivedSuggestions, { onChange: onSignedBy, required: !fullRefusal })}
    {error && E.status(error, "w")}
    {E.btn(busy ? "Saving…" : fullRefusal ? "Record refusal" : hasRefusal ? "Record partial delivery" : "Delivered", disabled ? "irr disabled" : "irr", undefined, onSubmit)}
  </>;
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
  return <DeliveryOutcomeFields lines={lines} receivedSuggestions={receivedSuggestions} transfer={transfer} signedBy={signedBy} refused={refused} reason={reason} note={note}
    transferRefused={transferRefused} busy={busy} error={error} onSignedBy={setSignedBy}
    onRefused={(key, qty) => setRefused({ ...refused, [key]: qty })} onReason={setReason} onNote={setNote}
    onTransferRefused={setTransferRefused} onSubmit={() => onSubmit?.({ signedBy, reason: reason || undefined, note, transferRefused,
      refused: Object.entries(refused).filter(([, qty]) => qty > 0).map(([orderLineId, qty]) => ({ orderLineId, qty })),
    })} />;
}
