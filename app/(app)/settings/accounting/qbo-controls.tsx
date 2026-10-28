"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { QboConnectionView, QboDefaultsView, DisconnectQuickBooksView, QboSyncView } from "@/components/mgr/views/accounting";
import { QboMappingView, QboMappingSheetView, type QboMappingKind } from "@/components/mgr/views/qbo-mapping";
import { useCommandAction, useCommandForm } from "@/lib/commands/use-command-form";
import type { QboSyncStatus } from "@/lib/mgr/accounting-view";
import { qboMappingVersion, qboPushConfirmation, type QboInvoiceAction, type QboRemoteCreateAction } from "@/lib/mgr/qbo-ui";
import { submitReason } from "@/lib/mgr/submit-reason";

export function QboConnectionAction({ configured, reconnect = false }: { configured: boolean; reconnect?: boolean }) {
  const action = useCommandAction();
  return <QboConnectionView configured={configured} reconnect={reconnect} busy={action.busy} error={action.error} onConnect={() => void action.run("connect_qbo", { reconnect }, data => location.assign((data as { authorizeUrl: string }).authorizeUrl))} />;
}

export function QboDefaultsForm({ allowAch, allowCard }: { allowAch: boolean; allowCard: boolean }) {
  const action = useCommandAction();
  return <QboDefaultsView allowAch={allowAch} allowCard={allowCard} busy={action.busy} error={action.error} onSave={(ach, card) => void action.run("set_qbo_push_defaults", { allowAch: ach, allowCard: card })} />;
}

/** Accounting's Disconnect: a confirming dialog over the page (#1509). A
 *  finished disconnect closes it and refreshes Accounting, which then offers
 *  Connect, or says QuickBooks did not confirm revocation. Unlike Square's
 *  dialog it closes either way: QuickBooks has no Retry revocation step. */
export function QboDisconnectAction({ connectionId }: { connectionId: string }) {
  const action = useCommandAction();
  const [open, setOpen] = useState(false);
  return <CommandForm open={open} onOpenChange={next => { if (!action.busy) { setOpen(next); action.setError(null); } }} title="Disconnect QuickBooks" trigger={E.act("Disconnect", "destructive")}>
    <div className="flex flex-col gap-2"><DisconnectQuickBooksView busy={action.busy} error={action.error}
      onDisconnect={() => void action.run("disconnect_qbo", { connectionId }, () => setOpen(false))} /></div>
  </CommandForm>;
}

type MappingProps = { kind: QboMappingKind; localId?: string; label: string; currentId?: string | null; context?: "accounting" | "invoice" };
export function QboMappingForm(props: MappingProps) {
  return <QboMappingFields key={qboMappingVersion(props.currentId)} {...props} />;
}

function QboMappingFields({ kind, localId, label, currentId, context = "accounting" }: MappingProps) {
  const [remoteId, setRemoteId] = useState(currentId ?? "");
  const name = kind === "customer" ? "set_qbo_customer_mapping" : kind === "item" ? "set_qbo_item_mapping"
    : kind === "vendor" ? "set_qbo_vendor_mapping" : kind === "purchase_account" ? "set_qbo_purchase_account"
      : kind === "deposit" ? "set_qbo_deposit_mapping" : "set_qbo_one_way_fee_mapping";
  const build = () => kind === "customer" ? { customerId: localId, qboCustomerId: remoteId.trim() }
    : kind === "item" ? { skuId: localId, qboItemId: remoteId.trim() }
      : kind === "vendor" ? { vendorId: localId, qboVendorId: remoteId.trim() }
        : kind === "purchase_account" ? { qboAccountId: remoteId.trim() } : { qboItemId: remoteId.trim() };
  const form = useCommandForm(name, { build, reset: () => setRemoteId(currentId ?? "") });
  return <QboMappingSheetView open={form.open} onOpenChange={form.setOpen} context={context} currentId={currentId}>
    <QboMappingView kind={kind} label={label} value={remoteId} onChange={setRemoteId} onSubmit={form.submit} busy={form.submitting} error={form.error} companyConflict={context === "accounting"} />
  </QboMappingSheetView>;
}

export function QboSyncButton({ status, disabled = false }: { status?: QboSyncStatus; disabled?: boolean }) {
  const action = useCommandAction(), router = useRouter();
  // A superseded result needs no local notice: the refreshed stored status already shows it.
  const sync = async () => {
    await action.run("sync_qbo_payments", {}, undefined, { requestId: status?.retryRequestId ?? undefined, refresh: false });
    router.refresh();
  };
  return <QboSyncView status={status} disabled={disabled} busy={action.busy} error={action.error} onSync={() => void sync()} />;
}

export function QboInvoiceActions({ invoiceId, invoiceLabel, actions }: { invoiceId: string; invoiceLabel: string; actions: QboInvoiceAction[] }) {
  const commandAction = useCommandAction();
  const [reason, setReason] = useState("");
  const [pendingPush, setPendingPush] = useState<QboRemoteCreateAction | null>(null);
  const writeOff = useCommandForm("write_off_invoice", { build: () => ({ invoiceId, reason }), reset: () => setReason("") });
  const confirmation = pendingPush ? qboPushConfirmation(pendingPush, invoiceLabel) : null;
  const push = async (action: QboRemoteCreateAction) => {
    const newAttemptReason = action === "corrected_push" ? "corrected" : action === "repush" ? "remote_deleted" : undefined;
    if (await commandAction.run("push_invoice_to_qbo", { invoiceId, ...(newAttemptReason ? { newAttemptReason } : {}) }, undefined, { target: invoiceId })) setPendingPush(null);
  };
  return <div className="flex flex-wrap justify-end gap-2">
    {actions.includes("fix_mapping") && <Button variant="outline" asChild><a href={`/invoices/${invoiceId}/mapping`}>Fix mapping</a></Button>}
    {actions.includes("push") && <Button type="button" onClick={() => setPendingPush("push")}>Push to QuickBooks</Button>}
    {actions.includes("retry") && <Button type="button" onClick={() => setPendingPush("retry")}>Retry exact push</Button>}
    {actions.includes("corrected_push") && <Button type="button" onClick={() => setPendingPush("corrected_push")}>Push corrected invoice</Button>}
    {actions.includes("repush") && <Button type="button" onClick={() => setPendingPush("repush")}>Re-push deleted invoice</Button>}
    {confirmation && <CommandForm open onOpenChange={(open) => { if (!open) { setPendingPush(null); commandAction.setError(null); } }} title={confirmation.title}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{confirmation.detail}</p>
        <CommandFormMessage error={commandAction.error} />
        <CommandFormFooter><Button type="button" disabled={commandAction.busy} onClick={() => void push(pendingPush!)}>{commandAction.busy ? "Sending…" : confirmation.confirmLabel}</Button></CommandFormFooter>
      </div>
    </CommandForm>}
    {actions.includes("write_off") && <CommandForm open={writeOff.open} onOpenChange={writeOff.setOpen} title="Write off invoice" trigger={<Button variant="destructive">Write off</Button>}>
      <form className="flex flex-col gap-3" onSubmit={writeOff.submit}>
        <p className="text-sm text-muted-foreground">This records a local status and reason. It does not change QuickBooks, record cash, or create a credit.</p>
        <Label htmlFor="qbo-write-off-reason">Reason</Label><Input id="qbo-write-off-reason" value={reason} onChange={e => setReason(e.target.value)} required maxLength={500} />
        <CommandFormMessage error={writeOff.error} /><CommandFormFooter>{E.submit("Confirm write-off", { variant: "destructive", submitting: writeOff.submitting, busy: "Writing off…", reason: submitReason(reason.trim() ? [] : ["a reason"]) })}</CommandFormFooter>
      </form>
    </CommandForm>}
  </div>;
}
