"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { useCommandAction, useCommandForm } from "@/lib/commands/use-command-form";
import { money } from "@/lib/mgr/money";
import { qboMappingVersion, qboPushConfirmation, type QboInvoiceAction, type QboRemoteCreateAction } from "@/lib/mgr/qbo-ui";

export function QboConnectionAction({ configured, reconnect = false }: { configured: boolean; reconnect?: boolean }) {
  const action = useCommandAction();
  return <div className="flex flex-col gap-2">
    <Button disabled={!configured || action.busy} onClick={() => void action.run("connect_qbo", { reconnect }, data => location.assign((data as { authorizeUrl: string }).authorizeUrl))}>
      {action.busy ? "Opening QuickBooks…" : reconnect ? "Reconnect QuickBooks" : "Connect QuickBooks"}
    </Button>
    {!configured && <p className="text-sm text-muted-foreground">QuickBooks setup is unavailable until the server connection values are configured.</p>}
    <CommandFormMessage error={action.error} />
  </div>;
}

export function QboDefaultsForm({ allowAch, allowCard }: { allowAch: boolean; allowCard: boolean }) {
  const action = useCommandAction();
  const [ach, setAch] = useState(allowAch), [card, setCard] = useState(allowCard);
  return <form className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); void action.run("set_qbo_push_defaults", { allowAch: ach, allowCard: card }); }}>
    <label className="flex items-center justify-between gap-3 text-sm">Bank transfer (ACH)<input className="size-5" type="checkbox" checked={ach} onChange={e => setAch(e.target.checked)} /></label>
    <label className="flex items-center justify-between gap-3 text-sm">Card<input className="size-5" type="checkbox" checked={card} onChange={e => setCard(e.target.checked)} /></label>
    <p className="text-sm text-muted-foreground">These choices apply to the next push. Turning both off prevents QuickBooks from creating an online payment link.</p>
    <Button disabled={action.busy}>{action.busy ? "Saving…" : "Save push defaults"}</Button>
    <CommandFormMessage error={action.error} />
  </form>;
}

export function QboDisconnectAction({ connectionId }: { connectionId: string }) {
  const action = useCommandAction(), router = useRouter();
  return <div className="flex flex-col gap-3">
    <Button variant="destructive" disabled={action.busy} onClick={() => void action.run("disconnect_qbo", { connectionId }, () => router.push("/settings/accounting/connect"))}>
      {action.busy ? "Disconnecting…" : "Disconnect QuickBooks"}
    </Button>
    <CommandFormMessage error={action.error} />
  </div>;
}

type MappingProps = { kind: "customer" | "item" | "deposit"; localId?: string; label: string; currentId?: string | null };
export function QboMappingForm({ kind, localId, label, currentId }: MappingProps) {
  return <QboMappingFields key={qboMappingVersion(currentId)} kind={kind} localId={localId} label={label} currentId={currentId} />;
}

function QboMappingFields({ kind, localId, label, currentId }: MappingProps) {
  const [remoteId, setRemoteId] = useState(currentId ?? "");
  const name = kind === "customer" ? "set_qbo_customer_mapping" : kind === "item" ? "set_qbo_item_mapping" : "set_qbo_deposit_mapping";
  const build = () => kind === "customer" ? { customerId: localId, qboCustomerId: remoteId }
    : kind === "item" ? { skuId: localId, qboItemId: remoteId } : { qboItemId: remoteId };
  const form = useCommandForm(name, { build, reset: () => setRemoteId(currentId ?? "") });
  return <CommandForm open={form.open} onOpenChange={form.setOpen} title={`Map ${label}`} trigger={<Button variant="outline" size="sm">{currentId ? "Change" : "Map"}</Button>}>
    <form className="flex flex-col gap-3" onSubmit={form.submit}>
      <p className="text-sm text-muted-foreground">Verify the record in the connected QuickBooks company and enter its exact ID. MGR never chooses automatically from a matching name.</p>
      <Label htmlFor={`qbo-${kind}-${localId ?? "default"}`}>QuickBooks {kind === "item" ? "item" : kind} ID</Label>
      <Input id={`qbo-${kind}-${localId ?? "default"}`} value={remoteId} onChange={e => setRemoteId(e.target.value)} required />
      <CommandFormMessage error={form.error} />
      <CommandFormFooter><Button disabled={form.submitting || !remoteId.trim()}>{form.submitting ? "Saving…" : "Save mapping"}</Button></CommandFormFooter>
    </form>
  </CommandForm>;
}

export function QboSyncButton() {
  const action = useCommandAction();
  return <div className="flex flex-col items-end gap-2"><Button variant="outline" disabled={action.busy} onClick={() => void action.run("sync_qbo_payments", {})}>{action.busy ? "Syncing…" : "Sync QuickBooks"}</Button><CommandFormMessage error={action.error} /></div>;
}

export function QboInvoiceActions({ invoiceId, invoiceLabel, actions }: { invoiceId: string; invoiceLabel: string; actions: QboInvoiceAction[] }) {
  const commandAction = useCommandAction();
  const [reason, setReason] = useState("");
  const [pendingPush, setPendingPush] = useState<QboRemoteCreateAction | null>(null);
  const writeOff = useCommandForm("write_off_invoice", { build: () => ({ invoiceId, reason }), reset: () => setReason("") });
  const confirmation = pendingPush ? qboPushConfirmation(pendingPush, invoiceLabel) : null;
  const push = async (action: QboRemoteCreateAction) => {
    const newAttemptReason = action === "corrected_push" ? "corrected" : action === "repush" ? "remote_deleted" : undefined;
    if (await commandAction.run("push_invoice_to_qbo", { invoiceId, ...(newAttemptReason ? { newAttemptReason } : {}) })) setPendingPush(null);
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
        <CommandFormMessage error={writeOff.error} /><CommandFormFooter><Button variant="destructive" disabled={writeOff.submitting || !reason.trim()}>{writeOff.submitting ? "Writing off…" : "Confirm write-off"}</Button></CommandFormFooter>
      </form>
    </CommandForm>}
  </div>;
}

export function QboInvoiceRow({ invoiceId, invoiceLabel, detail, balanceCents, actions, healthy }: {
  invoiceId: string; invoiceLabel: string; detail: string; balanceCents: number | null; actions: QboInvoiceAction[]; healthy: boolean;
}) {
  return E.row(
    "QuickBooks",
    `${detail}${balanceCents != null && balanceCents > 0 && !detail.includes(money(balanceCents)) ? ` · ${money(balanceCents)} balance` : ""}`,
    <QboInvoiceActions invoiceId={invoiceId} invoiceLabel={invoiceLabel} actions={actions} />,
    healthy ? "ok" : "w",
  );
}
