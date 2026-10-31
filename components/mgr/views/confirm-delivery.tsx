// components/mgr/views/confirm-delivery.tsx — Confirm delivery. Live slots
// DeliveredForm; inventory and live share the outcome controls. Both outcome
// verbs sit in the shared CommandFormFooter, Delivered last (#1226).
"use client";

import { Fragment, useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { CommandFormFooter } from "@/components/mgr/command-form";
import { IRREVERSIBLE } from "@/components/mgr/irreversible-submit";
import { deliveryOutcomeState, type ConfirmDeliveryViewModel } from "@/lib/mgr/confirm-delivery-view";
import { REFUSAL_REASONS } from "@/lib/mgr/enums";
import { shipToAddress } from "@/lib/mgr/ship-to-view";

const REFUSAL_LABEL: Record<(typeof REFUSAL_REASONS)[number], string> = {
  customer_refused: "Customer refused", damaged: "Damaged in transit", wrong_item: "Wrong item", other: "Other",
};

export function ConfirmDeliveryView({
  model,
  action,
}: {
  model: ConfirmDeliveryViewModel;
  action?: ReactNode;
}) {
  const missingAddress: string[] = [];
  if (model.shipTo === null) missingAddress.push("Ship-to address not recorded");
  else if (model.shipTo) {
    if (!model.shipTo.address1?.trim()) missingAddress.push("Street address not recorded");
    if (!model.shipTo.zip?.trim()) missingAddress.push("Postal code not recorded");
  }
  return (
    <>
      {E.back(model.backTo ?? "Driver route", model.title, undefined, model.backHref)}
      {E.ttl(model.heading)}
      {model.shipTo !== undefined && E.fld("Ship to", model.shipTo ? [model.shipTo.label, shipToAddress(model.shipTo)].filter(Boolean).join(" · ") : "Not recorded")}
      {missingAddress.length > 0 && E.note(`${missingAddress.join(" · ")}. Confirm the destination before travelling.`, "alert")}
      {E.fld("Invoice timing", model.invoiceTiming)}
      {model.lines.map((row) => (
        <Fragment key={row.key}>{E.row(row.title, "", row.qty)}</Fragment>
      ))}
      {action ?? <DeliveryOutcomeForm lines={model.lines} initialSignedBy={model.receivedBy} receivedSuggestions={model.receivedSuggestions} />}
    </>
  );
}

export function DeliveryOutcomeForm({ lines, transfer = false, initialSignedBy = "", receivedSuggestions, busy, blocked = false, error, onSubmit, onLeave }: {
  lines: { key: string; title: string; qty: string }[]; transfer?: boolean; initialSignedBy?: string; receivedSuggestions?: string[];
  busy?: boolean; blocked?: boolean; error?: string | null; onLeave?: () => void; onSubmit?: (input: { signedBy: string; refused: { orderLineId: string; qty: number }[]; reason?: string; note: string; transferRefused: boolean }) => void;
}) {
  const [signedBy, setSignedBy] = useState(initialSignedBy);
  const [refused, setRefused] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [transferRefused, setTransferRefused] = useState(false);
  const outcome = deliveryOutcomeState(lines, { signedBy, refused, reason, note, transferRefused }, transfer);
  const { hasRefusal, fullRefusal } = outcome;
  function submit() {
    if (busy || blocked || outcome.reason) return;
    onSubmit?.({ signedBy, reason: reason || undefined, note, transferRefused, refused: outcome.refused });
  }
  return <>
    {blocked && E.note("An earlier delivery action may have completed. Use Retry saved request before editing or choosing either action.")}
    <fieldset disabled={busy || blocked} className="flex min-w-0 flex-col gap-2">
    {transfer ? E.row("Transfer refused", "Stock stays in transit", E.sw(transferRefused, "Transfer refused", setTransferRefused)) : outcome.rows.map((line) => <Fragment key={line.key}>
      {E.edit(`${line.title} · refused`, line.value, "number", undefined, {
        id: `refused-${line.key}`, min: 0, max: Number(line.qty), step: 1, error: line.error,
        onChange: (value) => setRefused({ ...refused, [line.key]: value }),
      })}
      {E.fld("Accepted", line.accepted === null ? "—" : String(line.accepted))}
    </Fragment>)}
    {hasRefusal && <>
      {E.pick("Refusal reason", reason, REFUSAL_REASONS.map((value) => ({ value, label: REFUSAL_LABEL[value] })), { onChange: setReason, required: true })}
      {E.edit("Refusal note", note, "text", undefined, { onChange: setNote, required: reason === "other" })}
      {E.note("Refused beer closes on this order. Stock returns only after a physical check-in. Redelivery of refused beer needs a new order.")}
    </>}
    {E.edit("Received by", signedBy, "text", receivedSuggestions, { onChange: setSignedBy, required: !fullRefusal })}
    {error && E.status(error, "w")}
    <CommandFormFooter>
      {/* Inventory keeps the same action inert; the live adapter supplies the command. */}
      {E.btn("Not delivered · leave for a later route", "g", undefined, onLeave ?? (() => {}))}
      {E.submit(fullRefusal ? "Record refusal" : hasRefusal ? "Record partial delivery" : "Delivered", {
        id: "confirm-delivery", type: "button", reason: outcome.reason, submitting: busy, onClick: submit,
        className: IRREVERSIBLE,
      })}
    </CommandFormFooter>
    </fieldset>
  </>;
}
