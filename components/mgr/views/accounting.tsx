"use client";
import { useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { QuickBooksMark } from "@/components/mgr/brand-icons";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CommandFormMessage } from "@/components/mgr/command-form";
import type { AccountingViewModel } from "@/lib/mgr/accounting-view";

export function QboSyncView({ busy = false, error, onSync }: { busy?: boolean; error?: string | null; onSync?: () => void }) {
  return <div className="flex flex-col items-end gap-2"><Button variant="outline" disabled={busy} onClick={onSync}>{busy ? "Syncing…" : "Sync QuickBooks"}</Button><CommandFormMessage error={error} /></div>;
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

export function AccountingView({ model, connection, defaults, messages }: { model: AccountingViewModel; connection?: ReactNode; defaults?: ReactNode; messages?: ReactNode }) {
  return <>
    {E.back("Settings", "Accounting", undefined, model.backHref)}
    {E.ttl("QuickBooks")}{messages}
    {E.row(model.company, model.status, model.canDisconnect ? E.act("Disconnect", "destructive", model.disconnectHref) : "", model.connected ? "ok" : "w", QuickBooksMark)}
    {model.error && E.note(`Last connection error: ${model.error}`)}
    {!model.connected && (connection !== undefined ? connection : <QboConnectionView reconnect={model.reconnect} />)}
    {model.disconnectUnavailable && E.gated("Disconnect QuickBooks", "The disconnect command requires a connected state. Reconnect to recover this connection first.")}
    {E.row("Online payments", "checked when a customer opens Pay", "fail closed", "ok", QuickBooksMark)}
    {model.connected && <>{E.fld("Company", model.company)}{model.access && E.fld("Access", model.access)}{E.nav("Mappings", "Customers, SKUs and returnable-keg deposits", "", undefined, model.mappingsHref)}</>}
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

export function DisconnectQuickBooksView({ connected = true, recoveryRequired = false, busy = false, error, onDisconnect }: { connected?: boolean; recoveryRequired?: boolean; busy?: boolean; error?: string | null; onDisconnect?: () => void }) {
  return <>
    {E.note("Stops: invoice push, payment links and paid-date sync.")}
    {E.info("Stays: MGR invoices, QuickBooks ids and customer/item mappings. Reconnecting the same company restores its mappings; a different company clears them.")}
    {connected ? <Button type="button" variant="destructive" disabled={busy} onClick={onDisconnect}>{busy ? "Disconnecting…" : "Disconnect QuickBooks"}</Button> : recoveryRequired ? E.gated("Disconnect QuickBooks", "The existing command requires a connected state. Reconnect to recover this connection first.") : E.info("QuickBooks is already disconnected.")}
    <CommandFormMessage error={error} />
  </>;
}
