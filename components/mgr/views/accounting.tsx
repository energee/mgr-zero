"use client";
import { useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { QuickBooksMark } from "@/components/mgr/brand-icons";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CommandFormMessage } from "@/components/mgr/command-form";
import type { AccountingViewModel, QboSyncStatus } from "@/lib/mgr/accounting-view";
import type { QboStaffInvoiceLink } from "@/lib/mgr/qbo-ui";
import type { DisconnectStatus } from "@/lib/mgr/integration-disconnect";

export function QboStaffInvoiceLinkView({ link }: { link: QboStaffInvoiceLink | null | undefined }) {
  if (link === null) return null;
  return link?.href ? E.act("Open in QuickBooks", "primary", link.href)
    : E.gated("Open in QuickBooks", link?.reason ?? "A verified provider link is unavailable. Open QuickBooks separately to find this document.");
}

export function QboSyncView({ busy = false, disabled = false, error, onSync, status }: { busy?: boolean; disabled?: boolean; error?: string | null; onSync?: () => void; status?: QboSyncStatus }) {
  // Failure history stores only time and operator; the view writes its own copy, and retry guidance follows the saved identity.
  return <div className="flex flex-col gap-2">
    {E.ttl("Manual payment sync")}
    {E.fld("Last successful sync", status?.lastSuccess ? `${status.lastSuccess.at} · ${status.lastSuccess.operator}` : "No successful sync recorded")}
    {status?.latest && E.fld("Latest sync activity", `${status.latest.at} · ${status.latest.operator} · ${status.latest.superseded ? "superseded · no payment changes applied" : status.latest.completed ? "completed" : "not completed"}`)}
    {status?.latest?.superseded && E.info("The saved batch was superseded. Start a new manual sync to read current payment status.")}
    {status?.latestFailure && E.note(`Latest failed attempt: ${status.latestFailure.at} · ${status.latestFailure.operator}. Sync not completed for that attempt.`)}
    {status?.retryRequestId && E.info(disabled ? "QuickBooks must be reconnected before you retry the saved batch." : "Retry saved sync keeps your original invoice set and request identity.")}
    {E.info("Payment status may be stale until you complete a manual sync. No automatic reconciliation runs.")}
    {E.btn(busy ? "Syncing…" : status?.retryRequestId ? "Retry saved sync" : "Sync QuickBooks", busy || disabled ? "g disabled" : "g", undefined, onSync)}
    <CommandFormMessage error={error} />
  </div>;
}

export function QboConnectionView({ configured = true, reconnect = false, busy = false, error, onConnect }: { configured?: boolean; reconnect?: boolean; busy?: boolean; error?: string | null; onConnect?: () => void }) {
  return <div className="flex flex-col gap-2">
    <Button type="button" data-variant="irreversible" className="bg-irreversible text-irreversible-foreground hover:bg-irreversible/90" disabled={!configured || busy} onClick={onConnect}>{busy ? "Opening QuickBooks…" : reconnect ? "Reconnect QuickBooks" : "Connect QuickBooks"}</Button>
    {!configured && <p className="text-sm text-muted-foreground">QuickBooks setup is unavailable until the server connection values are configured.</p>}
    <CommandFormMessage error={error} />
  </div>;
}

export function QboDefaultsView({ allowAch, allowCard, busy = false, disabled = false, error, onSave }: { allowAch: boolean; allowCard: boolean; busy?: boolean; disabled?: boolean; error?: string | null; onSave?: (ach: boolean, card: boolean) => void }) {
  const [ach, setAch] = useState(allowAch), [card, setCard] = useState(allowCard);
  return <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); if (!busy && !disabled) onSave?.(ach, card); }}>
    {E.info("Every invoice is pushed with these payment options. Turning both off means customers cannot pay online at all.")}
    {E.row("Bank transfer (ACH)", `${ach ? "on" : "off"} · lowest fee`, <Switch aria-label="Bank transfer payments" checked={ach} onCheckedChange={setAch} disabled={busy || disabled} />, ach ? "ok" : "")}
    {E.row("Card", `${card ? "on" : "off"} · percentage fee applies`, <Switch aria-label="Card payments" checked={card} onCheckedChange={setCard} disabled={busy || disabled} />, card ? "ok" : "")}
    <p className="text-sm text-muted-foreground">These choices apply to the next push, never retroactively.</p>
    <Button disabled={busy || disabled}>{busy ? "Saving…" : "Save push defaults"}</Button>
    <CommandFormMessage error={error} />
  </form>;
}

export function AccountingView({ model, connection, defaults, messages, sync }: { model: AccountingViewModel; connection?: ReactNode; defaults?: ReactNode; messages?: ReactNode; sync?: ReactNode }) {
  return <>
    {E.back("Settings", "Accounting", undefined, model.backHref)}
    {E.ttl("QuickBooks")}{messages}
    {E.row(model.company, model.status, model.canDisconnect ? E.act("Disconnect", "destructive", model.disconnectHref) : "", model.connected ? "ok" : "w", QuickBooksMark)}
    {model.error && E.note(`Last connection error: ${model.error}`)}
    {!model.connected && (connection !== undefined ? connection : <QboConnectionView reconnect={model.reconnect} />)}
    {E.row("Online payments", "checked when a customer opens Pay", "fail closed", "ok", QuickBooksMark)}
    {model.connected && <>{E.fld("Company", model.company)}{model.access && E.fld("Access", model.access)}{E.nav("Mappings", "Customers, SKUs and returnable-keg deposits", "", undefined, model.mappingsHref)}</>}
    {sync !== undefined ? sync : <QboSyncView status={model.syncStatus} disabled={!model.connected} />}
    {E.ttl("Push defaults")}
    {defaults !== undefined ? defaults : model.defaults ? <QboDefaultsView {...model.defaults} disabled={!model.connected} /> : E.gated("Push defaults", "Connect QuickBooks to read and save the company's payment options.")}
    {E.row("Customers missing an email", model.missingEmails === undefined ? "Count unavailable · review customer email addresses" : `${model.missingEmails} · cannot be pushed`, E.act("Review", "primary", model.customersHref), model.missingEmails ? "w" : "")}
    {model.remoteRevocationUnresolved && E.note("Local access is disconnected. QuickBooks could not confirm remote revocation; reconnect to continue.")}
    {E.info("QuickBooks remains the accounting record. Connecting does not push existing invoices, and MGR never displays credentials.")}
  </>;
}

export function ConnectQuickBooksView({ backHref, connection }: { backHref?: string; connection?: ReactNode }) {
  return <>{E.back("Settings", "Connect QuickBooks", undefined, backHref)}{E.info("MGR reads customers, items, invoice status and payments. It creates wholesale invoices and credit memos.")}{E.note("QuickBooks remains the accounting record. Connecting does not push existing invoices.")}{connection !== undefined ? connection : <QboConnectionView />}</>;
}

/** The disconnect confirmation; `status` (lib/mgr/integration-disconnect.ts) decides whether the action is offered. */
export function DisconnectQuickBooksView({ status = "available", busy = false, error, onDisconnect }: { status?: DisconnectStatus; busy?: boolean; error?: string | null; onDisconnect?: () => void }) {
  return <>
    {E.note("Stops: invoice push, payment links and paid-date sync.")}
    {E.info("Stays: MGR invoices, QuickBooks ids and customer/item mappings. Reconnecting the same company restores its mappings; a different company clears them.")}
    {status === "available" && <>
      {E.info("MGR deletes its stored QuickBooks credential first, then asks QuickBooks to revoke it. If QuickBooks does not confirm, this page says so.")}
      <Button type="button" variant="destructive" disabled={busy} onClick={onDisconnect}>{busy ? "Disconnecting…" : "Disconnect QuickBooks"}</Button>
    </>}
    {status === "unresolved" && E.note("MGR deleted its stored QuickBooks credential, but QuickBooks did not confirm revocation. Remove MGR's access in your QuickBooks company, or reconnect.")}
    {status === "disconnected" && E.info("QuickBooks is already disconnected.")}
    <CommandFormMessage error={error} />
  </>;
}
