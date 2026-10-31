"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { SquareMark } from "@/components/mgr/brand-icons";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { SettingsSaveStatus } from "@/components/mgr/settings-save-status";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import type { DisconnectStatus } from "@/lib/mgr/integration-disconnect";
import { integrationUnavailableReason } from "@/lib/mgr/integration-availability";
import { reconcileBooleanChange, type PosLocationRow, type PosMenuModel, type PosSaleRow, type PosVariationRow } from "@/lib/mgr/pos-view";

const SelectField = ({ id, label, value, options, onChange }: {
  id: string; label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void;
}) => E.pick(label, value, [{ value: "", label: "Select " + (label.toLowerCase()), disabled: true }, ...(options.map(option => ({ value: option.value, label: option.label })))], { onChange: (nextValue: string) => onChange(nextValue), id });

/** Point of sale's one Sync Square button and its feedback slot (#1509); SquareSyncControls runs the catalog and sales syncs behind it. */
export function PosSyncActions({ busy = false, label = "Sync Square", feedback, onSync }: {
  busy?: boolean; label?: string; feedback?: ReactNode; onSync?: () => void;
}) {
  return <div className="flex flex-col gap-2">
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="outline" disabled={busy} onClick={onSync}>{busy ? "Syncing…" : label}</Button>
    </div>
    {feedback}
  </div>;
}

/** `connection` is the Connect Square control and `disconnect` the row's
 *  Disconnect; the app page passes working controls (a confirming dialog for
 *  Disconnect) and the inventory draws the plain views (#1509). The intro
 *  note shows only until Square is connected (#1518). */
export function PointOfSaleView({ model, sales = [], coverage = [], syncAction, connection, disconnect, paths }: {
  model: { connected: boolean; configured?: boolean; canDisconnect?: boolean; merchant: string; state: string; locations?: string; lastSync?: string; error?: string | null; oauthFailed?: boolean };
  sales?: PosSaleRow[]; coverage?: string[];
  syncAction?: ReactNode; connection?: ReactNode; disconnect?: ReactNode; paths?: { back?: string; locations?: string; menu?: string; accounting?: string };
}) {
  const disconnectAction = disconnect ?? E.act("Disconnect", "destructive");
  return <>
    {E.back("Settings", "Point of sale", undefined, paths?.back)}
    {!model.connected && E.info("Publish what the taproom can sell, and read Square sales as expected consumption. One provider is connected at a time.")}
    {model.connected
      ? E.row(`Square · ${model.merchant}`, model.state, disconnectAction, "ok", SquareMark)
      : E.row("Square", model.state, model.canDisconnect ? disconnectAction : "", "w", SquareMark)}
    {model.oauthFailed && E.note("Square authorization was cancelled or could not finish. The existing connection was not replaced.", "alert")}
    {(!model.connected || model.oauthFailed) && (connection ?? <ConnectSquareView configured={model.configured} reconnect={model.connected} />)}
    {model.error && E.note(`Last connection error: ${model.error}`, "alert")}
    {model.connected && <>
      {E.nav("Square locations", model.locations, "", undefined, paths?.locations)}
      {E.fld("Last complete sales sync", model.lastSync)}
      {E.nav("Menu", "One catalog · per-location stock and price", "", undefined, paths?.menu)}
      {syncAction}
      {E.ttl("Sales coverage")}
      {coverage.length ? coverage.map((line, index) => <div key={`${line}-${index}`}>{E.row(line, "Completed observation window", E.status("Complete", "ok"), "ok")}</div>) : E.note("No complete Square sales coverage yet. A failed or partial sync is not counted as coverage.")}
      {E.ttl("Recent Square facts")}
      {sales.length ? sales.map(sale => <div key={sale.id}>{sale.href || sale.openable ? E.nav(sale.label, sale.detail, sale.status === "mapped" ? "ok" : "w", undefined, sale.href) : E.row(sale.label, sale.detail, sale.amount, sale.status === "mapped" ? "ok" : "w")}</div>) : E.blank("No Square sale facts yet")}
    </>}
    {E.ttl("Separate accounting feed")}
    {E.note("Square may already post taproom sales to QuickBooks Online as sales receipts.")}
    {E.info("MGR pushes wholesale invoices only. Confirm with your accountant that the two revenue streams stay separate; MGR does not detect, configure, or synchronize this Square connector.")}
    {E.btn("Open Accounting", "g", paths?.accounting)}
  </>;
}

/** Point of sale's Connect Square control, drawn on the page itself (#1509). */
export function ConnectSquareView({ configured = true, reconnect = false, busy = false, error, onConnect }: {
  configured?: boolean; reconnect?: boolean; busy?: boolean; error?: string | null; onConnect?: () => void;
}) {
  return <div className="flex flex-col gap-2">
    {E.note("Connecting does not publish a menu, import old sales, or change inventory.")}
    <Button disabled={!configured || busy} onClick={onConnect}>{busy ? "Opening Square…" : reconnect ? "Reconnect Square" : "Connect Square"}</Button>
    {!configured && <p className="text-sm text-muted-foreground">{integrationUnavailableReason.square}</p>}
    <CommandFormMessage error={error ?? null} />
  </div>;
}

/** A mapping row's pick, saved at once; a failed save puts the pick back (#1509). */
function useSavedPick<Row>(row: Row, saved: string, onSave?: (row: Row, value: string) => Promise<boolean>) {
  const [value, setValue] = useState(saved);
  const pick = (next: string) => {
    if (next === value) return;
    setValue(next);
    void onSave?.(row, next).then(ok => { if (!ok) setValue(value); });
  };
  return [value, pick] as const;
}

function LocationMappingRow({ row, locations, onSave, onRetire, busy }: {
  row: PosLocationRow; locations: { id: string; name: string }[];
  onSave?: (row: PosLocationRow, locationId: string) => Promise<boolean>;
  onRetire?: (row: PosLocationRow) => Promise<boolean>;
  busy?: boolean;
}) {
  const [locationId, pick] = useSavedPick(row, row.mgrLocationId, onSave);
  return <div className="flex flex-col gap-3 rounded-lg border p-3">
    {E.hd(row.name, row.detail)}
    <SelectField id={`pos-location-${row.externalLocationId}`} label="MGR location" value={locationId}
      options={locations.map(location => ({ value: location.id, label: location.name }))} onChange={pick} />
    {row.mgrLocationId && <details>
      <summary className="cursor-pointer text-sm">Retire mapping</summary>
      {E.info("Keep existing sales at their saved location. Remove this menu and release the mapping so an Admin can map it correctly for future sales.")}
      {E.btn("Retire mapping", busy ? "del disabled" : "del", undefined, () => void onRetire?.(row))}
    </details>}
  </div>;
}

export function SquareLocationsView({ rows, locations, busy, error, onSave, onRetire }: {
  rows: PosLocationRow[]; locations: { id: string; name: string }[]; busy?: boolean; error?: string | null;
  /** Resolves false when the save failed. */
  onSave?: (row: PosLocationRow, locationId: string) => Promise<boolean>;
  onRetire?: (row: PosLocationRow) => Promise<boolean>;
}) {
  return <>
    {E.info("Locations come from Square. Each can map to one MGR location. Retire a mistaken mapping before replacing it; historical sales stay at their saved location.")}
    {rows.length ? rows.map(row => <LocationMappingRow key={`${row.externalLocationId}:${row.mgrLocationId}`} row={row} locations={locations} onSave={onSave} onRetire={onRetire} busy={busy} />) : E.blank("Sync Square to load locations")}
    <SettingsSaveStatus busy={busy} />
    <CommandFormMessage error={error ?? null} />
  </>;
}

/** The disconnect dialog's body; `status` (lib/mgr/integration-disconnect.ts) decides whether the action is offered. */
export function DisconnectSquareView({ status = "available", busy = false, error, onDisconnect }: {
  status?: DisconnectStatus; busy?: boolean; error?: string | null; onDisconnect?: () => void;
}) {
  return <>
    {E.note("Stops: menu publishing, availability updates, and sales sync.")}
    {E.info("Stays: MGR stock, location mappings, sales history, and published item identities.")}
    {status === "available" && <>
      {E.info("MGR deletes its stored Square credential first, then asks Square to revoke it. If Square does not confirm, this dialog says so.")}
      <Button variant="destructive" disabled={busy} onClick={onDisconnect}>{busy ? "Disconnecting…" : "Disconnect Square"}</Button>
    </>}
    {status === "unresolved" && <>
      {E.note("MGR deleted its stored Square credential, but Square did not confirm revocation. Retry asks Square to revoke MGR's access for this seller; you can also remove it in your Square account, or reconnect.", "alert")}
      <Button variant="destructive" disabled={busy} onClick={onDisconnect}>{busy ? "Retrying…" : "Retry revocation"}</Button>
    </>}
    {status === "pending" && E.note("A disconnect started but its Square revocation outcome was not recorded. MGR no longer holds a usable credential.", "alert")}
    {status === "disconnected" && E.info("Square is already disconnected.")}
    <CommandFormMessage error={error ?? null} />
  </>;
}

function VariationMappingRow({ row, targets, busy, onSave }: {
  row: PosVariationRow; targets: { value: string; label: string }[]; busy?: boolean;
  onSave?: (row: PosVariationRow, target: string) => Promise<boolean>;
}) {
  const [target, pick] = useSavedPick(row, row.target, onSave);
  return <div className="flex flex-col gap-3 rounded-lg border p-3">
    {E.hd(row.label, row.detail)}
    <SelectField id={`pos-variation-${row.externalVariationId}`} label="Mapping" value={target}
      options={[...targets, { value: "ignore", label: "Ignore this variation" }]} onChange={pick} />
    {busy && <p role="status" className="text-sm text-muted-foreground">Saving…</p>}
  </div>;
}

export function PosSaleDetailView({ title, sale, revisions, backHref, backLabel = "Point of sale" }: {
  title: string; sale: PosSaleRow & { location: string; soldAt: string; quantity: string; expected: string; source: string };
  revisions: { label: string; detail: string; current: boolean }[]; backHref?: string; backLabel?: string;
}) {
  return <>
    {E.back(backLabel, title, undefined, backHref)}
    {E.row(`${sale.location} · ${sale.soldAt}`, sale.detail, sale.amount, sale.status === "mapped" ? "ok" : "w", SquareMark)}
    {E.fld("Source identity", sale.source)}
    {E.fld("Quantity", sale.quantity)}
    {E.fld("Expected consumption", sale.expected)}
    {E.ttl("Source revisions")}
    {revisions.map(revision => <div key={revision.label}>{E.row(revision.label, revision.detail, revision.current ? E.status("Current", "ok") : E.status("History"), revision.current ? "ok" : "")}</div>)}
    {E.info("Square supplied expected consumption only. No inventory movement was posted by this sale or return.")}
  </>;
}

export function PosMenuView({ model, bins = [], channels = [], targets = [], busy, savingKey, error, notice, onConfigure, onPublish, onMap, backHref }: {
  model: PosMenuModel; bins?: { id: string; name: string }[]; channels?: { id: string; name: string }[];
  /** Map choices for "Also in Square": `sku:<id>`, `format:<id>`; the row adds `ignore`. */
  targets?: { value: string; label: string }[];
  busy?: boolean; error?: string | null; notice?: ReactNode; backHref?: string;
  /** `externalItemId:externalVariationId` of the Square row whose mapping is saving. */
  savingKey?: string;
  onConfigure?: (binId: string, channelId: string) => void; onPublish?: () => void;
  /** Resolves false when the save failed. */
  onMap?: (row: PosVariationRow, target: string) => Promise<boolean>;
}) {
  const [binId, setBinId] = useState(""), [channelId, setChannelId] = useState("");
  const configure = (event: FormEvent) => { event.preventDefault(); onConfigure?.(binId, channelId); };
  // With no mapped location there is nothing to configure or list: show the
  // model's setup step instead (#997). Its link, if any, comes from the caller.
  const mapped = Boolean(model.selectedLocationId);
  const mappingRow = (row: PosVariationRow) => {
    const key = `${row.externalItemId}:${row.externalVariationId}`;
    return <VariationMappingRow key={key} row={row} targets={targets} busy={busy && savingKey === key} onSave={onMap} />;
  };
  return <>
    {E.back("More", model.title ?? "Menu", undefined, backHref)}
    {model.setup && E.blank(model.setup, undefined, model.setup.action && E.btn(model.setup.action.label, "p", model.setup.action.href))}
    {mapped && <div role="tablist" aria-label="Square location" className="flex flex-wrap gap-2">{model.locations.map(location => <Button role="tab" aria-selected={location.id === model.selectedLocationId} key={location.id} variant={location.id === model.selectedLocationId ? "default" : "outline"} size="sm" asChild={Boolean(location.href)}>{location.href ? <a href={location.href}>{location.label}</a> : location.label}</Button>)}</div>}
    {model.message && E.note(model.message)}
    {model.selectedLocationId && !model.binName && <form className="flex flex-col gap-3 rounded-lg border p-3" onSubmit={configure}>
      {E.ttl(`Configure ${model.locationName}`)}
      <SelectField id="pos-menu-bin" label="MGR bin" value={binId} options={bins.map(bin => ({ value: bin.id, label: bin.name }))} onChange={setBinId} />
      <SelectField id="pos-menu-channel" label="Sales channel" value={channelId} options={channels.map(channel => ({ value: channel.id, label: channel.name }))} onChange={setChannelId} />
      <Button disabled={busy || !binId || !channelId}>{busy ? "Saving…" : "Configure menu"}</Button>
    </form>}
    {model.binName && <>{E.fld("Availability source", `${model.locationName} · ${model.binName}`)}{E.fld("Price source", model.channelName ?? "Not configured")}</>}
    {model.items.map(item => <div key={`${item.brandId}:${item.formatId}`}>{item.href ? E.nav(item.label, `${item.retail} · ${item.source} · ${item.destinations}`, "ok", undefined, item.href) : E.row(item.label, `${item.retail} · ${item.source} · ${item.destinations}`, "", "ok")}</div>)}
    {/* Off-register rows can number in the hundreds; the count keeps current items first (#1516). */}
    {model.excluded.length > 0 && <details className="rounded border p-3">
      <summary className="cursor-pointer text-sm font-medium">{model.excluded.length} need attention</summary>
      <div className="mt-3">{model.excluded.map(item => <div key={`${item.brandId}:${item.formatId}`}>{item.href ? E.nav(item.label, item.reason ?? "Unavailable", "w", undefined, item.href) : E.row(item.label, item.reason ?? "Unavailable", E.status("Off register", "w"), "w")}</div>)}</div>
    </details>}
    {model.binName && <Button disabled={busy || model.items.length + model.excluded.length === 0} onClick={onPublish}>{busy ? "Publishing…" : "Publish changes"}</Button>}
    {notice}
    <CommandFormMessage error={error ?? null} />
    {model.externalItems.length > 0 && <>
      {E.ttl("Also in Square")}
      {E.info("These Square items have sold but did not come from MGR. Map one to a SKU or pour so its sales count toward the taproom variance, or ignore it.")}
      {model.externalItems.filter(row => row.disposition === "queued").map(row => mappingRow(row))}
      {model.externalItems.some(row => row.disposition !== "queued") && E.ttl("Mapped or ignored")}
      {model.externalItems.filter(row => row.disposition !== "queued").map(row => mappingRow(row))}
    </>}
  </>;
}

/** One menu item. Save and publish saves the price override, then publishes the item to Square (#1509). */
export function PosItemView({ item, price, busy, error, notice, onSave, onWebsite }: {
  item: { brand: string; format: string; sources: string; serving: string; price: string; override: string; websitePublished: boolean; available: boolean };
  price?: string; busy?: boolean; error?: string | null; notice?: ReactNode;
  onSave?: (value: string) => void; onWebsite?: (published: boolean) => Promise<boolean>;
}) {
  const [value, setValue] = useState(price ?? item.override), [website, setWebsite] = useState(item.websitePublished);
  return <>
    {E.fld("Brand", item.brand)}{E.fld("Format", item.format)}{E.fld("Pours from", item.sources || "No stocked keg in this menu bin")}
    {E.fld("Serving", item.serving)}{E.fld("Format price", item.price)}{E.fld("Availability", item.available ? "In the selected bin" : "Off register · no selected-bin stock")}
    <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); onSave?.(value); }}>
      {E.edit("Price override", value, "number", undefined, { onChange: (nextValue: string) => setValue(nextValue), id: "pos-price-override", min: "0", step: "0.01", placeholder: "Follow format price" })}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setValue("")}>Reset to format price</Button><Button disabled={busy}>{busy ? "Publishing…" : "Save and publish"}</Button></div>
    </form>
    <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">Publish on website<input type="checkbox" className="size-5" checked={website} onChange={event => { if (onWebsite) void reconcileBooleanChange(website, event.target.checked, onWebsite, setWebsite); }} disabled={!onWebsite || busy || !item.available} /></label>
    {E.info("An empty override follows the format price. Availability remains derived from stock in this location's configured bin.")}
    {notice}<CommandFormMessage error={error ?? null} />
  </>;
}
