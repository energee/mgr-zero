"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommandForm } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { QboConnectionView, QboDefaultsView, DisconnectQuickBooksView, QboSyncView } from "@/components/mgr/views/accounting";
import { QboMappingView, QboMappingSheetView, type QboMappingKind, type QboPicker } from "@/components/mgr/views/qbo-mapping";
import { InvoiceAccountingActionsView } from "@/components/mgr/views/invoice-accounting";
import { useCommandAction, useCommandForm } from "@/lib/commands/use-command-form";
import type { QboSyncStatus } from "@/lib/mgr/accounting-view";
import { qboMappingVersion, type QboInvoiceAction, type QboRemoteCreateAction } from "@/lib/mgr/qbo-ui";
import { toast } from "sonner";

export function QboConnectionAction({ configured, reconnect = false }: { configured: boolean; reconnect?: boolean }) {
  const action = useCommandAction();
  return <QboConnectionView configured={configured} reconnect={reconnect} busy={action.busy} error={action.error} onConnect={() => void action.run("connect_qbo", { reconnect }, data => location.assign((data as { authorizeUrl: string }).authorizeUrl))} />;
}

/** A tapped switch saves at once and returns to the stored values if the save
 *  fails, as GravityUnitForm does (#1509). */
export function QboDefaultsForm({ allowAch, allowCard }: { allowAch: boolean; allowCard: boolean }) {
  const action = useCommandAction();
  const [choice, setChoice] = useState({ allowAch, allowCard });
  // The server props are the truth once they catch up (GravityUnitForm explains the in-render reset).
  const [seen, setSeen] = useState({ allowAch, allowCard });
  if (seen.allowAch !== allowAch || seen.allowCard !== allowCard) {
    setSeen({ allowAch, allowCard });
    setChoice({ allowAch, allowCard });
  }
  const save = (ach: boolean, card: boolean) => {
    setChoice({ allowAch: ach, allowCard: card });
    void action.run("set_qbo_push_defaults", { allowAch: ach, allowCard: card }).then(ok => {
      if (ok) toast.success("Push defaults saved");
      else setChoice({ allowAch, allowCard });
    });
  };
  return <QboDefaultsView {...choice} busy={action.busy} error={action.error} onChange={save} />;
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

/** Customer and item mappings pick from a live QuickBooks list, read each time
 *  the dialog opens (#1515); vendors and the purchase account keep typed IDs. */
const PICKER_QUERY: Partial<Record<QboMappingKind, string>> = {
  customer: "list_qbo_customers", item: "list_qbo_items", deposit: "list_qbo_items", one_way_fee: "list_qbo_items",
};

function QboMappingFields({ kind, localId, label, currentId, context = "accounting" }: MappingProps) {
  const [remoteId, setRemoteId] = useState(currentId ?? "");
  const list = useCommandAction();
  const [options, setOptions] = useState<QboPicker["options"]>([]);
  const query = PICKER_QUERY[kind];
  const picker = query ? { options, loading: list.busy, error: list.error } : undefined;
  const name = kind === "customer" ? "set_qbo_customer_mapping" : kind === "item" ? "set_qbo_item_mapping"
    : kind === "vendor" ? "set_qbo_vendor_mapping" : kind === "purchase_account" ? "set_qbo_purchase_account"
      : kind === "deposit" ? "set_qbo_deposit_mapping" : "set_qbo_one_way_fee_mapping";
  const build = () => kind === "customer" ? { customerId: localId, qboCustomerId: remoteId.trim() }
    : kind === "item" ? { skuId: localId, qboItemId: remoteId.trim() }
      : kind === "vendor" ? { vendorId: localId, qboVendorId: remoteId.trim() }
        : kind === "purchase_account" ? { qboAccountId: remoteId.trim() } : { qboItemId: remoteId.trim() };
  const form = useCommandForm(name, { build, reset: () => setRemoteId(currentId ?? "") });
  const openChange = (open: boolean) => {
    form.setOpen(open);
    if (open && query) void list.run(query, {}, data => setOptions(data as QboPicker["options"]), { durable: false, refresh: false });
  };
  return <QboMappingSheetView open={form.open} onOpenChange={openChange} context={context} currentId={currentId}>
    <QboMappingView kind={kind} label={label} value={remoteId} onChange={setRemoteId} onSubmit={form.submit} busy={form.submitting} error={form.error} companyConflict={context === "accounting"} picker={picker} />
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
  const push = async (action: QboRemoteCreateAction) => {
    const newAttemptReason = action === "corrected_push" ? "corrected" : action === "repush" ? "remote_deleted" : undefined;
    if (await commandAction.run("push_invoice_to_qbo", { invoiceId, ...(newAttemptReason ? { newAttemptReason } : {}) }, undefined, { target: invoiceId })) setPendingPush(null);
  };
  return <InvoiceAccountingActionsView invoiceLabel={invoiceLabel} actions={actions} mappingHref={`/invoices/${invoiceId}/mapping`}
    push={{ pending: pendingPush, onPending: next => { setPendingPush(next); commandAction.setError(null); }, busy: commandAction.busy, error: commandAction.error, onConfirm: action => void push(action) }}
    writeOff={{ open: writeOff.open, onOpenChange: writeOff.setOpen, reason, onReasonChange: setReason, busy: writeOff.submitting, error: writeOff.error, onSubmit: writeOff.submit }} />;
}
