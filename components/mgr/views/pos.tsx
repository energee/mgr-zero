"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { SquareMark } from "@/components/mgr/brand-icons";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reconcileBooleanChange, type PosLocationRow, type PosMenuModel, type PosSaleRow, type PosVariationRow } from "@/lib/mgr/pos-view";

const SelectField = ({ id, label, value, options, onChange }: {
  id: string; label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void;
}) => <div className="flex flex-col gap-2"><Label htmlFor={id}>{label}</Label><select role="combobox" id={id} value={value} onChange={event => onChange(event.target.value)} className="h-9 rounded-md border bg-transparent px-3 text-sm">
  <option value="">Select {label.toLowerCase()}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
</select></div>;

export function PosSyncActions({ catalogBusy = false, salesBusy = false, catalogLabel = "Sync Square catalog", salesLabel = "Sync Square sales", feedback, onCatalog, onSales }: {
  catalogBusy?: boolean; salesBusy?: boolean; catalogLabel?: string; salesLabel?: string; feedback?: ReactNode;
  onCatalog?: () => void; onSales?: () => void;
}) {
  return <div className="flex flex-col gap-2">
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="outline" disabled={catalogBusy} onClick={onCatalog}>{catalogBusy ? "Syncing catalog…" : catalogLabel}</Button>
      <Button variant="outline" disabled={salesBusy} onClick={onSales}>{salesBusy ? "Syncing sales…" : salesLabel}</Button>
    </div>
    {feedback}
  </div>;
}

export function PointOfSaleView({ model, syncAction, live = false }: {
  model: { connected: boolean; merchant: string; state: string; locations: string; lastSync: string; error?: string | null };
  syncAction?: ReactNode; live?: boolean;
}) {
  return <>
    {E.back("Settings", "Point of sale", undefined, live ? "/settings" : "#")}
    {E.info("Publish what the taproom can sell, and read Square sales as expected consumption. One provider is connected at a time.")}
    {model.connected
      ? E.row(`Square · ${model.merchant}`, model.state, E.act("Disconnect", "destructive", live ? "/settings/pos/disconnect" : undefined), "ok", SquareMark)
      : E.row("Square", model.state, E.act("Connect", "primary", live ? "/settings/pos/connect" : undefined), "w", SquareMark)}
    {model.error && E.note(`Last connection error: ${model.error}`)}
    {model.connected && <>
      {E.nav("Square locations", model.locations, "", undefined, live ? "/settings/pos/locations" : undefined)}
      {E.nav("POS mapping", "Map or ignore every Square variation; review sales and coverage", "", undefined, live ? "/settings/pos/mapping" : undefined)}
      {E.fld("Last complete sales sync", model.lastSync)}
      {E.nav("Menu", "One catalog · per-location stock and price", "", undefined, live ? "/menu" : undefined)}
      {syncAction}
    </>}
    {E.nav(<>Square {E.arrow()} QuickBooks connector</>, "Review the separate taproom revenue feed", "w", SquareMark, live ? "/settings/pos/connector" : undefined)}
  </>;
}

export function ConnectSquareView({ configured = true, busy = false, error, onConnect, live = false }: {
  configured?: boolean; busy?: boolean; error?: string | null; onConnect?: () => void; live?: boolean;
}) {
  return <>
    {E.back("Point of sale", "Connect Square", undefined, live ? "/settings/pos" : "#")}
    {E.info("MGR publishes owned catalog items to Square and reads completed sales as expected consumption.")}
    {E.note("Connecting does not publish a menu, import old sales, or change inventory.")}
    <Button disabled={!configured || busy} onClick={onConnect}>{busy ? "Opening Square…" : "Connect Square"}</Button>
    {!configured && <p className="text-sm text-muted-foreground">Square setup is unavailable until the server connection values are configured.</p>}
    <CommandFormMessage error={error ?? null} />
  </>;
}

function LocationMappingRow({ row, locations, busy, onSave }: {
  row: PosLocationRow; locations: { id: string; name: string }[]; busy?: boolean;
  onSave?: (row: PosLocationRow, locationId: string) => void;
}) {
  const [locationId, setLocationId] = useState(row.mgrLocationId);
  return <form className="flex flex-col gap-3 rounded-lg border p-3" onSubmit={event => { event.preventDefault(); onSave?.(row, locationId); }}>
    {E.hd(row.name, row.detail)}
    <SelectField id={`pos-location-${row.externalLocationId}`} label="MGR location" value={locationId}
      options={locations.map(location => ({ value: location.id, label: location.name }))} onChange={setLocationId} />
    <Button disabled={busy || !locationId}>{busy ? "Saving…" : "Save mapping"}</Button>
  </form>;
}

export function SquareLocationsView({ rows, locations, busy, error, onSave }: {
  rows: PosLocationRow[]; locations: { id: string; name: string }[]; busy?: boolean; error?: string | null;
  onSave?: (row: PosLocationRow, locationId: string) => void;
}) {
  return <>
    {E.info("Locations come from Square. Each can map to one MGR location; a location with observed sales history cannot be remapped.")}
    {rows.length ? rows.map(row => <LocationMappingRow key={row.externalLocationId} row={row} locations={locations} busy={busy} onSave={onSave} />) : E.blank("Sync the Square catalog to load locations")}
    <CommandFormMessage error={error ?? null} />
  </>;
}

export function SquareConnectorView({ live = false }: { live?: boolean } = {}) {
  return <>
    {E.note("Square may already post taproom sales to QuickBooks Online as sales receipts.")}
    {E.info("MGR pushes wholesale invoices only. Confirm with your accountant that the two revenue streams stay separate; MGR does not configure or synchronize this Square connector.")}
    {E.btn("Open Accounting", "g", live ? "/settings/accounting" : undefined)}
  </>;
}

export function DisconnectSquareView({ connected = true, busy = false, error, onDisconnect }: {
  connected?: boolean; busy?: boolean; error?: string | null; onDisconnect?: () => void;
}) {
  return <>
    {E.note("Stops: menu publishing, availability updates, and sales sync.")}
    {E.info("Stays: MGR stock, location mappings, sales history, and published item identities.")}
    {connected ? <Button variant="destructive" disabled={busy} onClick={onDisconnect}>{busy ? "Disconnecting…" : "Disconnect Square"}</Button> : E.info("Square is already disconnected.")}
    <CommandFormMessage error={error ?? null} />
  </>;
}

function VariationMappingRow({ row, targets, busy, onSave }: {
  row: PosVariationRow; targets: { value: string; label: string }[]; busy?: boolean;
  onSave?: (row: PosVariationRow, target: string) => void;
}) {
  const [target, setTarget] = useState(row.disposition === "ignored" ? "ignore" : "");
  return <form className="flex flex-col gap-3 rounded-lg border p-3" onSubmit={event => { event.preventDefault(); onSave?.(row, target); }}>
    {E.hd(row.label, row.disposition)}
    <p className="text-sm text-muted-foreground">{row.detail}</p>
    <SelectField id={`pos-variation-${row.externalVariationId}`} label="Mapping" value={target}
      options={[...targets, { value: "ignore", label: "Ignore this variation" }]} onChange={setTarget} />
    <Button disabled={busy || !target}>{busy ? "Saving…" : row.disposition === "mapped" ? "Fix mapping" : "Save mapping"}</Button>
  </form>;
}

export function PosMappingView({ variations, targets, sales, coverage, busy, error, syncAction, onSave, live = false }: {
  variations: PosVariationRow[]; targets: { value: string; label: string }[]; sales: PosSaleRow[];
  coverage: string[]; busy?: boolean; error?: string | null; syncAction?: ReactNode; live?: boolean;
  onSave?: (row: PosVariationRow, target: string) => void;
}) {
  return <>
    {E.back("Point of sale", "POS mapping", syncAction, live ? "/settings/pos" : "#")}
    {E.info("Map a Square variation to one packaged SKU or poured format, or explicitly ignore it. Sales remain source facts and never post inventory.")}
    {E.ttl("Variation queue")}
    {variations.length ? variations.map(row => <VariationMappingRow key={`${row.externalItemId}:${row.externalVariationId}`} row={row} targets={targets} busy={busy} onSave={onSave} />) : E.blank("No Square variations yet")}
    <CommandFormMessage error={error ?? null} />
    {E.ttl("Sales coverage")}
    {coverage.length ? coverage.map((line, index) => <div key={`${line}-${index}`}>{E.row(line, "Completed observation window", E.status("Complete", "ok"), "ok")}</div>) : E.note("No complete Square sales coverage yet. A failed or partial sync is not counted as coverage.")}
    {E.ttl("Recent Square facts")}
    {sales.length ? sales.map(sale => <div key={sale.id}>{E.row(sale.label, sale.detail, sale.href || sale.openable ? E.act("Open", "primary", sale.href) : sale.amount, sale.status === "mapped" ? "ok" : "w")}</div>) : E.blank("No Square sale facts yet")}
    {E.note("The physical count posts depletion. Square sales and returns supply the expected amount used for variance.")}
  </>;
}

export function PosSaleDetailView({ title, sale, revisions, live = false }: {
  title: string; sale: PosSaleRow & { location: string; soldAt: string; quantity: string; expected: string; source: string };
  revisions: { label: string; detail: string; current: boolean }[]; live?: boolean;
}) {
  return <>
    {E.back("POS mapping", title, undefined, live ? "/settings/pos/mapping" : "#")}
    {E.row(`${sale.location} · ${sale.soldAt}`, sale.detail, sale.amount, sale.status === "mapped" ? "ok" : "w", SquareMark)}
    {E.fld("Source identity", sale.source)}
    {E.fld("Quantity", sale.quantity)}
    {E.fld("Expected consumption", sale.expected)}
    {E.ttl("Source revisions")}
    {revisions.map(revision => <div key={revision.label}>{E.row(revision.label, revision.detail, revision.current ? E.status("Current", "ok") : E.status("History"), revision.current ? "ok" : "")}</div>)}
    {E.info("Square supplied expected consumption only. No inventory movement was posted by this sale or return.")}
  </>;
}

export function PosMenuView({ model, bins = [], channels = [], busy, error, notice, onConfigure, onPublish, live = false }: {
  model: PosMenuModel; bins?: { id: string; name: string }[]; channels?: { id: string; name: string }[];
  busy?: boolean; error?: string | null; notice?: ReactNode; live?: boolean;
  onConfigure?: (binId: string, channelId: string) => void; onPublish?: () => void;
}) {
  const [binId, setBinId] = useState(""), [channelId, setChannelId] = useState("");
  const configure = (event: FormEvent) => { event.preventDefault(); onConfigure?.(binId, channelId); };
  return <>
    {E.back("More", model.title ?? "Menu", undefined, live ? "/more" : "#")}
    <div role="tablist" aria-label="Square location" className="flex flex-wrap gap-2">{model.locations.map(location => <Button role="tab" aria-selected={location.id === model.selectedLocationId} key={location.id} variant={location.id === model.selectedLocationId ? "default" : "outline"} size="sm" asChild={Boolean(location.href)}>{location.href ? <a href={location.href}>{location.label}</a> : location.label}</Button>)}</div>
    {E.info("One catalog, scoped to this location. Price and availability come from the selected channel and exact MGR bin.")}
    {model.message && E.note(model.message)}
    {model.selectedLocationId && !model.binName && <form className="flex flex-col gap-3 rounded-lg border p-3" onSubmit={configure}>
      {E.ttl(`Configure ${model.locationName}`)}
      <SelectField id="pos-menu-bin" label="MGR bin" value={binId} options={bins.map(bin => ({ value: bin.id, label: bin.name }))} onChange={setBinId} />
      <SelectField id="pos-menu-channel" label="Sales channel" value={channelId} options={channels.map(channel => ({ value: channel.id, label: channel.name }))} onChange={setChannelId} />
      <Button disabled={busy || !binId || !channelId}>{busy ? "Saving…" : "Configure menu"}</Button>
    </form>}
    {model.binName && <>{E.fld("Availability source", `${model.locationName} · ${model.binName}`)}{E.fld("Price source", model.channelName ?? "Not configured")}</>}
    {model.items.map(item => <div key={item.formatId}>{E.row(item.label, `${item.retail} · ${item.source} · ${item.destinations}`, item.href ? E.act("Open", "primary", item.href) : "", "ok")}</div>)}
    {model.excluded.map(item => <div key={item.formatId}>{E.row(item.label, item.reason ?? "Unavailable", item.href ? E.act("Open", "primary", item.href) : E.status("Off register", "w"), "w")}</div>)}
    {model.binName && <Button disabled={busy || model.items.length + model.excluded.length === 0} onClick={onPublish}>{busy ? "Publishing…" : "Publish changes"}</Button>}
    {notice}
    <CommandFormMessage error={error ?? null} />
    {E.ttl("Also in Square")}
    {E.info("These destination-native rows are never renamed, priced, or retired by MGR. Map or ignore them so their sales have an explicit disposition.")}
    {model.externalItems.map(item => <div key={item.label}>{E.row(item.label, item.detail, item.href ? E.act(item.disposition === "ignored" ? "Review" : "Map", "primary", item.href) : E.status(item.disposition), item.disposition === "queued" ? "w" : "")}</div>)}
  </>;
}

export function PosItemView({ item, price, busy, error, notice, onSave, onWebsite, onPublish }: {
  item: { brand: string; format: string; sources: string; serving: string; price: string; override: string; websitePublished: boolean; available: boolean };
  price?: string; busy?: boolean; error?: string | null; notice?: ReactNode;
  onSave?: (value: string) => void; onWebsite?: (published: boolean) => Promise<boolean>; onPublish?: () => void;
}) {
  const [value, setValue] = useState(price ?? item.override), [website, setWebsite] = useState(item.websitePublished);
  return <>
    {E.fld("Brand", item.brand)}{E.fld("Format", item.format)}{E.fld("Pours from", item.sources || "No stocked keg in this menu bin")}
    {E.fld("Serving", item.serving)}{E.fld("Format price", item.price)}{E.fld("Availability", item.available ? "In the selected bin" : "Off register · no selected-bin stock")}
    <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); onSave?.(value); }}>
      <Label htmlFor="pos-price-override">Price override</Label><Input id="pos-price-override" type="number" min="0" step="0.01" value={value} onChange={event => setValue(event.target.value)} placeholder="Follow format price" />
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setValue("")}>Reset to format price</Button><Button disabled={busy}>{busy ? "Saving…" : "Save override"}</Button></div>
    </form>
    <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">Publish on website<input type="checkbox" className="size-5" checked={website} onChange={event => { if (onWebsite) void reconcileBooleanChange(website, event.target.checked, onWebsite, setWebsite); }} disabled={!onWebsite || busy || !item.available} /></label>
    {E.info("An empty override follows the format price. Availability remains derived from stock in this location's configured bin.")}
    <Button disabled={busy} onClick={onPublish}>{busy ? "Publishing…" : "Publish item to Square"}</Button>
    {notice}<CommandFormMessage error={error ?? null} />
  </>;
}
