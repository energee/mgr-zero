"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { formatDateTime } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { LinkTabs } from "@/components/mgr/work-tabs";
import { tapLabel, openTapBoardSheet, editTapBoardSheet, type TapBoardState, type TapBoardSheet, type TapSheetFields, type TapInterval } from "@/lib/mgr/tap-board-state";

export type TapSku = { id: string; name: string; nominalBbl: number };
const when = (value: string) => formatDateTime(value);
const day = (value: string) => new Date(value).toLocaleDateString("en-US", { weekday: "short" });
const volume = (value: number) => `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 })} bbl`;
const actor = (label: string | null) => label ? `@${label}` : "staff";
const fills = [[.25, "¼"], [.5, "½"], [.6, "60%"], [1, "Full"]] as const;
const closingFills = [[0, "Empty"], [.25, "About ¼ left"], [.5, "About ½ left"]] as const;

function FillChips({ values, value, onChange }: { values: readonly (readonly [number, string])[]; value: number; onChange: (value: number) => void }) {
  return <ToggleGroup type="single" variant="outline" size="sm" className="flex-wrap justify-start" value={String(value)} onValueChange={value => { if (value) onChange(Number(value)); }}>{values.map(([fill, label]) => <ToggleGroupItem key={fill} value={String(fill)}>{label}</ToggleGroupItem>)}</ToggleGroup>;
}

export function TapKegView({ sheet: controlledSheet, skus, onEdit, closedFact, onReload }: { sheet: TapBoardSheet; skus: TapSku[]; onEdit?: (fields: Partial<TapSheetFields>) => void; closedFact?: string | null; onReload?: () => void }) {
  const [internalSheet, setInternalSheet] = useState(controlledSheet);
  const sheet = onEdit ? controlledSheet : internalSheet;
  const locked = sheet.attempt.kind === "submitting" || sheet.attempt.kind === "unknown";
  const edit = (patch: Partial<TapSheetFields>) => { if (!locked) { if (onEdit) onEdit(patch); else setInternalSheet(current => ({ ...current, fields: { ...current.fields, ...patch } })); } };
  return <>
    {closedFact && E.row("Already swapped", closedFact, <Button type="button" variant="outline" onClick={onReload}>Reload</Button>, "w")}
    <fieldset disabled={locked} className="flex flex-col gap-3">
      {sheet.interval && <>{E.ttl(sheet.kind === "kick" ? `Kick tap ${sheet.interval.tap_number ?? "unnumbered"}` : "Coming off")}{E.fld(sheet.kind === "kick" ? "Coming off" : `Tap ${sheet.interval.tap_number ?? "unnumbered"}`, `${tapLabel(sheet.interval)} · ${volume(sheet.interval.nominal_bbl)} · on since ${when(sheet.interval.opened_at)} · ${actor(sheet.interval.opened_by_label)}`)}</>}
      {sheet.kind !== "tap" && <>
        <Field><FieldLabel>Reason</FieldLabel><select aria-label="Reason" className="min-w-0 rounded border bg-background p-2" value={sheet.fields.reason} onChange={e => edit({ reason: e.target.value })}>{["Kicked empty", "Flavor change", "Quality hold"].map(reason => <option key={reason}>{reason}</option>)}</select></Field>
        {E.ttl("Remaining")}
        <FillChips values={closingFills} value={sheet.fields.closeFill} onChange={value => edit({ closeFill: value as 0 | .25 | .5 })} />
      </>}
      {sheet.kind !== "kick" && <>
        {E.ttl("Going on")}
        {sheet.fields.identity !== "guest" && <Field><FieldLabel>Packaged keg SKU</FieldLabel><select aria-label="Packaged keg SKU" required className="min-w-0 rounded border bg-background p-2" value={sheet.fields.identity === "same" ? sheet.interval?.sku_id ?? "" : sheet.fields.skuId} onChange={e => edit({ identity: "own", skuId: e.target.value })}>
          <option value="">Choose a keg</option>{sheet.fields.identity === "same" && sheet.interval?.sku_id && !skus.some(sku => sku.id === sheet.interval?.sku_id) && <option value={sheet.interval.sku_id}>{tapLabel(sheet.interval)} · {volume(sheet.interval.nominal_bbl)}</option>}{skus.map(sku => <option key={sku.id} value={sku.id}>{sku.name} · {volume(sku.nominalBbl)}</option>)}
        </select></Field>}
        <Field><FieldLabel>Identity</FieldLabel><select aria-label="Identity" className="min-w-0 rounded border bg-background p-2" value={sheet.fields.identity} onChange={e => edit({ identity: e.target.value as TapSheetFields["identity"] })}>
          {sheet.kind === "swap" && <option value="same" disabled={!sheet.interval?.sku_id}>Same own SKU</option>}<option value="own">Own keg</option><option value="guest">Guest keg</option>
        </select></Field>
        {sheet.fields.identity === "guest" && <>
          <Field><FieldLabel>Guest keg label</FieldLabel><Input aria-label="Guest keg label" maxLength={200} required value={sheet.fields.guestLabel} onChange={e => edit({ guestLabel: e.target.value })} /></Field>
          <Field><FieldLabel>Guest nominal BBL</FieldLabel><Input aria-label="Guest nominal BBL" type="number" min="0" step="any" required value={sheet.fields.guestNominalBbl} onChange={e => edit({ guestNominalBbl: e.target.value })} /></Field>
        </>}
        <Field><FieldLabel>Tap number · optional and may repeat</FieldLabel><Input aria-label="Tap number · optional and may repeat" maxLength={80} value={sheet.fields.tapNumber} onChange={e => edit({ tapNumber: e.target.value })} /></Field>
        {E.ttl("Opening fill")}<FillChips values={fills} value={sheet.fields.openingFill} onChange={value => edit({ openingFill: value as .25 | .5 | .6 | 1 })} />
      </>}
    </fieldset>
    {E.info(`Remaining is a rough observation. ${sheet.kind === "swap" ? "The atomic swap" : "This action"} does not change finished-goods inventory.`)}
    {sheet.attempt.kind === "unknown" && <CommandFormMessage tone="warning">No trustworthy response arrived. The request and fields are frozen; retry unchanged to recover the original result.</CommandFormMessage>}
    {sheet.attempt.kind === "error" && <CommandFormMessage error={sheet.attempt.message} />}
    <CommandFormFooter><Button type="submit" variant={sheet.kind === "kick" ? "destructive" : "default"} data-variant={sheet.kind === "swap" ? "irreversible" : undefined} className={sheet.kind === "swap" ? "bg-irreversible text-irreversible-foreground hover:bg-irreversible/90" : undefined} disabled={sheet.attempt.kind === "submitting"}>{sheet.attempt.kind === "unknown" ? "Retry unchanged" : sheet.attempt.kind === "submitting" ? "Saving…" : sheet.kind === "tap" ? "Tap keg" : sheet.kind === "kick" ? "Kick keg" : "Swap · one record"}</Button></CommandFormFooter>
    {sheet.kind === "swap" && E.note("The swap is one record. A half-finished swap is not a state this can reach.")}
  </>;
}

export type TapBoardNavigation = { backHref?: string; countHref?: string; varianceHref?: string; locations: [string, string?][]; location: string };

export function TapBoardView({ state: controlledState, skus, navigation, recentEvents, pollError, onOpen, onClose, onEdit, onSubmit, onReload }: {
  state: TapBoardState; skus: TapSku[]; navigation: TapBoardNavigation; pollError?: string | null;
  recentEvents?: { title: string; detail: string }[];
  onOpen?: (kind: "tap" | "kick" | "swap", interval: TapInterval | null) => void; onClose?: () => void;
  onEdit?: (fields: Partial<TapSheetFields>) => void; onSubmit?: (event: FormEvent<HTMLFormElement>) => void; onReload?: () => void;
}) {
  const [internalState, setInternalState] = useState(controlledState);
  const state = onOpen ? controlledState : internalState;
  const open = onOpen ?? ((kind: "tap" | "kick" | "swap", interval: TapInterval | null) => setInternalState(current => openTapBoardSheet(current.snapshot, kind, interval)));
  const edit = onEdit ?? ((fields: Partial<TapSheetFields>) => setInternalState(current => editTapBoardSheet(current, fields)));
  const sheet = state.sheet;
  const recent = recentEvents ?? [...state.snapshot.open].sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime()).slice(0, 2).map(tap => ({ title: `Recent · ${tapLabel(tap)} tapped`, detail: `${actor(tap.opened_by_label)} · ${when(tap.opened_at)}` }));
  const closed = sheet?.interval && state.snapshot.history.find(tap => tap.id === sheet.interval?.id);
  const locked = sheet?.attempt.kind === "submitting" || sheet?.attempt.kind === "unknown";
  const actions = (tap: TapInterval) => <div className="mt-2 flex flex-wrap gap-1"><Button type="button" size="sm" variant="outline" onClick={() => open("swap", tap)}>Swap</Button><Button type="button" size="sm" variant="destructive" onClick={() => open("kick", tap)}>Kick</Button></div>;
  return <>
    {E.back("Beer", "Tap board", undefined, navigation.backHref)}
    <div className="flex items-center justify-between gap-2">{E.ttl("On tap")}<Button type="button" size="sm" disabled={navigation.locations.length === 0} onClick={() => open("tap", null)}>Tap keg</Button></div>
    {(navigation.countHref || navigation.varianceHref) && <div className="flex flex-wrap gap-3 text-sm">{navigation.countHref && <Link className="underline" href={navigation.countHref}>Weekly count</Link>}{navigation.varianceHref && <Link className="underline" href={navigation.varianceHref}>Variance by brand</Link>}</div>}
    {navigation.locations.length > 0 && (navigation.locations.some(([, href]) => href) ? <LinkTabs items={navigation.locations.map(([name, href]) => [name, href ?? "#"])} current={navigation.location} /> : E.tabs(navigation.locations.map(([name]) => name), navigation.locations.findIndex(([name]) => name === navigation.location)))}
    <CommandForm open={Boolean(sheet)} onOpenChange={next => { if (!next && !locked) { if (onClose) onClose(); else setInternalState(current => ({ ...current, sheet: null })); } }} title={sheet?.kind === "kick" ? "Kick keg" : sheet?.kind === "swap" ? "Swap keg" : "Tap keg"}>
      {sheet && <form onSubmit={event => { event.preventDefault(); onSubmit?.(event); }} className="flex flex-col gap-3"><TapKegView key={sheet.interval?.id ?? "new-tap"} sheet={sheet} skus={skus} onEdit={edit} onReload={onReload} closedFact={closed ? `${tapLabel(closed)} was closed ${when(closed.closed_at)} by ${actor(closed.closed_by_label)}. Review the board before acting.` : null} /></form>}
    </CommandForm>
    <CommandFormMessage tone="warning">{pollError}</CommandFormMessage>
    {navigation.locations.length === 0 ? E.blank("No taproom locations yet. Ask Admin to add one under Locations.") : state.snapshot.open.length === 0 ? E.blank("No kegs are on tap.") : <>
      {E.tiles(state.snapshot.open.filter(tap => tap.sku_id).map(tap => [tap.tap_number ?? "unnumbered", tapLabel(tap), <>{volume(tap.nominal_bbl)} · on <time dateTime={tap.opened_at} title={when(tap.opened_at)}>{day(tap.opened_at)}</time> · {actor(tap.opened_by_label)} · opened {Math.round(Number(tap.opening_fill) * 100)}%{tap.not_in_inventory ? " · not in taproom stock · excluded from variance" : ""}</>, tap.not_in_inventory ? 1 : 0, undefined, undefined, actions(tap)]))}
      {state.snapshot.open.filter(tap => !tap.sku_id).map(tap => <div key={tap.id}>{E.row(`${tap.tap_number ?? "unnumbered"} · ${tapLabel(tap)} · keg`, `nominal ${volume(tap.nominal_bbl)} · on ${when(tap.opened_at)} by ${actor(tap.opened_by_label)} · opened ${Math.round(Number(tap.opening_fill) * 100)}%${tap.not_in_inventory ? " · not in taproom stock · excluded from variance" : ""} · no guest yield`, actions(tap), "w")}</div>)}
    </>}
    {E.info("Unnumbered kegs sort last.")}
    {recent.map((event, index) => <div key={index}>{E.row(event.title, event.detail)}</div>)}
    {E.ttl("Recent history")}
    {state.snapshot.history.length === 0 ? E.blank("No closed kegs yet.") : state.snapshot.history.map(tap => <div key={tap.id}>{E.row(`Tap ${tap.tap_number ?? "unnumbered"} · ${tapLabel(tap)}`, `${tap.close_reason} · ${Math.round(Number(tap.closing_fill) * 100)}% left · closed ${when(tap.closed_at)} by ${actor(tap.closed_by_label)}`)}</div>)}
    {E.note("With no usable POS numerator, a row shows what is on and since when, with no bar. Guest labels are never matched to POS. Nothing on this board posts to the ledger; the weekly count does that.")}
  </>;
}
