"use client";

import { useState, type FormEventHandler } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { qboPushConfirmation, type QboInvoiceAction, type QboRemoteCreateAction } from "@/lib/mgr/qbo-ui";
import { submitReason } from "@/lib/mgr/submit-reason";

export function PushInvoiceView({ action, invoiceLabel, busy = false, error, onConfirm }: {
  action: QboRemoteCreateAction; invoiceLabel: string; busy?: boolean; error?: string | null; onConfirm?: () => void;
}) {
  const confirmation = qboPushConfirmation(action, invoiceLabel);
  return <div className="flex flex-col gap-3">
    <p className="text-sm text-muted-foreground">{confirmation.detail}</p>
    <CommandFormMessage error={error} />
    <CommandFormFooter><Button type="button" disabled={busy} onClick={onConfirm}>{busy ? "Sending…" : confirmation.confirmLabel}</Button></CommandFormFooter>
  </div>;
}

export function WriteOffInvoiceView({ reason: controlledReason, onReasonChange, busy = false, error, onSubmit }: {
  reason?: string; onReasonChange?: (reason: string) => void; busy?: boolean; error?: string | null; onSubmit?: FormEventHandler<HTMLFormElement>;
}) {
  const [draft, setDraft] = useState("");
  const reason = controlledReason ?? draft;
  return <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); if (!busy && reason.trim()) onSubmit?.(event); }}>
    <p className="text-sm text-muted-foreground">This records a local status and reason. It does not change QuickBooks, record cash, or create a credit.</p>
    {E.edit("Reason", reason, "text", undefined, { id: "qbo-write-off-reason", onChange: onReasonChange ?? setDraft, required: true, maxLength: 500, disabled: busy })}
    <CommandFormMessage error={error} />
    <CommandFormFooter>{E.submit("Confirm write-off", { variant: "destructive", submitting: busy, busy: "Writing off…", reason: submitReason(reason.trim() ? [] : ["a reason"]) })}</CommandFormFooter>
  </form>;
}

/** The same action row and responsive confirmation surfaces in inventory and live invoices. */
export function InvoiceAccountingActionsView({ invoiceLabel, actions, mappingHref = "#", push, writeOff }: {
  invoiceLabel: string; actions: QboInvoiceAction[]; mappingHref?: string;
  push?: { pending: QboRemoteCreateAction | null; onPending: (action: QboRemoteCreateAction | null) => void; busy: boolean; error: string | null; onConfirm: (action: QboRemoteCreateAction) => void };
  writeOff?: { open: boolean; onOpenChange: (open: boolean) => void; reason: string; onReasonChange: (reason: string) => void; busy: boolean; error: string | null; onSubmit: FormEventHandler<HTMLFormElement> };
}) {
  const [pending, setPending] = useState<QboRemoteCreateAction | null>(null);
  const [open, setOpen] = useState(false);
  const pendingPush = push ? push.pending : pending;
  const onPending = push?.onPending ?? setPending;
  return <div className="flex flex-wrap justify-end gap-2">
    {actions.includes("fix_mapping") && <Button variant="outline" asChild><a href={mappingHref}>Fix mapping</a></Button>}
    {actions.includes("push") && <Button type="button" onClick={() => onPending("push")}>Push to QuickBooks</Button>}
    {actions.includes("retry") && <Button type="button" onClick={() => onPending("retry")}>Retry exact push</Button>}
    {actions.includes("corrected_push") && <Button type="button" onClick={() => onPending("corrected_push")}>Push corrected invoice</Button>}
    {actions.includes("repush") && <Button type="button" onClick={() => onPending("repush")}>Re-push deleted invoice</Button>}
    {pendingPush && <CommandForm open onOpenChange={next => { if (!next) onPending(null); }} title={qboPushConfirmation(pendingPush, invoiceLabel).title}>
      <PushInvoiceView action={pendingPush} invoiceLabel={invoiceLabel} busy={push?.busy} error={push?.error} onConfirm={() => push?.onConfirm(pendingPush)} />
    </CommandForm>}
    {actions.includes("write_off") && <CommandForm open={writeOff?.open ?? open} onOpenChange={writeOff?.onOpenChange ?? setOpen} title="Write off invoice" trigger={<Button variant="destructive">Write off</Button>}>
      <WriteOffInvoiceView reason={writeOff?.reason} onReasonChange={writeOff?.onReasonChange} busy={writeOff?.busy} error={writeOff?.error} onSubmit={writeOff?.onSubmit} />
    </CommandForm>}
  </div>;
}
