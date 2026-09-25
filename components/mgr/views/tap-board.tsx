"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { formatDateTime, formatWeekday } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { LinkTabs } from "@/components/mgr/work-tabs";
import { tapLabel, openTapBoardSheet, editTapBoardSheet, type TapBoardState, type TapBoardSheet, type TapSheetFields, type TapInterval } from "@/lib/mgr/tap-board-state";

export type TapSku = { id: string; name: string; nominalBbl: number };
const volume = (value: number) => `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 })} bbl`;
const actor = (label: string | null) => label ? `@${label}` : "staff";
const fills = [[.25, "¼"], [.5, "½"], [.6, "60%"], [1, "Full"]] as const;
const closingFills = [[0, "Empty"], [.25, "About ¼ left"], [.5, "About ½ left"]] as const;

function FillChips({ values, value, onChange }: { values: readonly (readonly [number, string])[]; value: number; onChange: (value: number) => void }) {
  return <ToggleGroup type="single" variant="outline" size="sm" className="flex-wrap justify-start" value={String(value)} onValueChange={value => { if (value) onChange(Number(value)); }}>{values.map(([fill, label]) => <ToggleGroupItem key={fill} value={String(fill)}>{label}</ToggleGroupItem>)}</ToggleGroup>;
}

/** `timeZone` is the brewery's: the server renders this client view first, so both sides must format in one zone (#442). */
export function TapKegView({ sheet: controlledSheet, skus, timeZone, onEdit, closedFact, onReload }: { sheet: TapBoardSheet; skus: TapSku[]; timeZone: string; onEdit?: (fields: Partial<TapSheetFields>) => void; closedFact?: string | null; onReload?: () => void }) {
  const [internalSheet, setInternalSheet] = useState(controlledSheet);
  const sheet = onEdit ? controlledSheet : internalSheet;
  const locked = sheet.attempt.kind === "submitting" || sheet.attempt.kind === "unknown";
  const edit = (patch: Partial<TapSheetFields>) => { if (!locked) { if (onEdit) onEdit(patch); else setInternalSheet(current => ({ ...current, fields: { ...current.fields, ...patch } })); } };
  return <>
    {closedFact && E.row("Already swapped", closedFact, <Button type="button" variant="outline" onClick={onReload}>Reload</Button>, "w")}
    <fieldset disabled={locked} className="flex flex-col gap-3">
      {sheet.interval && <>{E.ttl(sheet.kind === "kick" ? `Kick tap ${sheet.interval.tap_number ?? "unnumbered"}` : "Coming off")}{E.fld(sheet.kind === "kick" ? "Coming off" : `Tap ${sheet.interval.tap_number ?? "unnumbered"}`, `${tapLabel(sheet.interval)} · ${volume(sheet.interval.nominal_bbl)} · on since ${formatDateTime(sheet.interval.opened_at, timeZone)} · ${actor(sheet.interval.opened_by_label)}`)}</>}
      {sheet.kind !== "tap" && <>
        {E.pick("Reason", sheet.fields.reason, (["Kicked empty", "Flavor change", "Quality hold"].map(reason => ({ value: reason, label: reason }))), { onChange: (nextValue: string) => edit({ reason: nextValue }) })}
        {E.ttl("Remaining")}
        <FillChips values={closingFills} value={sheet.fields.closeFill} onChange={value => edit({ closeFill: value as 0 | .25 | .5 })} />
      </>}
      {sheet.kind !== "kick" && <>
        {E.ttl("Going on")}
        {sheet.fields.identity !== "guest" && E.pick("Packaged keg SKU", sheet.fields.identity === "same" ? sheet.interval?.sku_id ?? "" : sheet.fields.skuId, [{ value: "", label: "Choose a keg" }, ...(sheet.fields.identity === "same" && sheet.interval?.sku_id && !skus.some(sku => sku.id === sheet.interval?.sku_id) ? [{ value: sheet.interval.sku_id, label: `${tapLabel(sheet.interval)} · ${volume(sheet.interval.nominal_bbl)}` }] : []), ...(skus.map(sku => ({ value: sku.id, label: sku.name + " · " + (volume(sku.nominalBbl)) })))], { onChange: (nextValue: string) => edit({ identity: "own", skuId: nextValue }), required: true })}
        {E.pick("Identity", String(sheet.fields.identity), [...(sheet.kind === "swap" ? [{ value: "same", label: "Same own SKU", disabled: !sheet.interval?.sku_id }] : []), { value: "own", label: "Own keg" }, { value: "guest", label: "Guest keg" }], { onChange: (nextValue: string) => edit({ identity: nextValue as TapSheetFields["identity"] }) })}
        {sheet.fields.identity === "guest" && <>
          {E.edit("Guest keg label", sheet.fields.guestLabel, "text", undefined, { onChange: (nextValue: string) => edit({ guestLabel: nextValue }), required: true, maxLength: 200 })}
          {E.edit("Guest nominal BBL", sheet.fields.guestNominalBbl, "number", undefined, { onChange: (nextValue: string) => edit({ guestNominalBbl: nextValue }), required: true, min: "0", step: "any" })}
        </>}
        {E.edit("Tap number · optional and may repeat", sheet.fields.tapNumber, "text", undefined, { onChange: (nextValue: string) => edit({ tapNumber: nextValue }), maxLength: 80 })}
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

/** `timeZone` is the brewery's: the server renders this client view first, so both sides must format in one zone (#442). */
export function TapBoardView({ state: controlledState, skus, timeZone, navigation, recentEvents, pollError, onOpen, onClose, onEdit, onSubmit, onReload }: {
  state: TapBoardState; skus: TapSku[]; timeZone: string; navigation: TapBoardNavigation; pollError?: string | null;
  recentEvents?: { title: string; detail: string }[];
  onOpen?: (kind: "tap" | "kick" | "swap", interval: TapInterval | null) => void; onClose?: () => void;
  onEdit?: (fields: Partial<TapSheetFields>) => void; onSubmit?: (event: FormEvent<HTMLFormElement>) => void; onReload?: () => void;
}) {
  const [internalState, setInternalState] = useState(controlledState);
  const state = onOpen ? controlledState : internalState;
  const open = onOpen ?? ((kind: "tap" | "kick" | "swap", interval: TapInterval | null) => setInternalState(current => openTapBoardSheet(current.snapshot, kind, interval)));
  const edit = onEdit ?? ((fields: Partial<TapSheetFields>) => setInternalState(current => editTapBoardSheet(current, fields)));
  const sheet = state.sheet;
  const recent = recentEvents ?? [...state.snapshot.open].sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime()).slice(0, 2).map(tap => ({ title: `Recent · ${tapLabel(tap)} tapped`, detail: `${actor(tap.opened_by_label)} · ${formatDateTime(tap.opened_at, timeZone)}` }));
  const closed = sheet?.interval && state.snapshot.history.find(tap => tap.id === sheet.interval?.id);
  const locked = sheet?.attempt.kind === "submitting" || sheet?.attempt.kind === "unknown";
  const actions = (tap: TapInterval) => <div className="mt-2 flex flex-wrap gap-1"><Button type="button" size="sm" variant="outline" onClick={() => open("swap", tap)}>Swap</Button><Button type="button" size="sm" variant="destructive" onClick={() => open("kick", tap)}>Kick</Button></div>;
  return <>
    {E.back("Beer", "Tap board", undefined, navigation.backHref)}
    <div className="flex items-center justify-between gap-2">{E.ttl("On tap")}<Button type="button" size="sm" disabled={navigation.locations.length === 0} onClick={() => open("tap", null)}>Tap keg</Button></div>
    {(navigation.countHref || navigation.varianceHref) && <div className="flex flex-wrap gap-3 text-sm">{navigation.countHref && <Link className="underline" href={navigation.countHref}>Weekly count</Link>}{navigation.varianceHref && <Link className="underline" href={navigation.varianceHref}>Variance by brand</Link>}</div>}
    {navigation.locations.length > 0 && (navigation.locations.some(([, href]) => href) ? <LinkTabs items={navigation.locations.map(([name, href]) => [name, href ?? "#"])} current={navigation.location} /> : E.tabs(navigation.locations.map(([name]) => name), navigation.locations.findIndex(([name]) => name === navigation.location)))}
    <CommandForm open={Boolean(sheet)} onOpenChange={next => { if (!next && !locked) { if (onClose) onClose(); else setInternalState(current => ({ ...current, sheet: null })); } }} title={sheet?.kind === "kick" ? "Kick keg" : sheet?.kind === "swap" ? "Swap keg" : "Tap keg"}>
      {sheet && <form onSubmit={event => { event.preventDefault(); onSubmit?.(event); }} className="flex flex-col gap-3"><TapKegView key={sheet.interval?.id ?? "new-tap"} sheet={sheet} skus={skus} timeZone={timeZone} onEdit={edit} onReload={onReload} closedFact={closed ? `${tapLabel(closed)} was closed ${formatDateTime(closed.closed_at, timeZone)} by ${actor(closed.closed_by_label)}. Review the board before acting.` : null} /></form>}
    </CommandForm>
    <CommandFormMessage tone="warning">{pollError}</CommandFormMessage>
    {navigation.locations.length === 0 ? E.blank("No taproom locations yet. Ask Admin to add one under Locations.") : state.snapshot.open.length === 0 ? E.blank("No kegs are on tap.") : <>
      {E.tiles(state.snapshot.open.filter(tap => tap.sku_id).map(tap => [tap.tap_number ?? "unnumbered", tapLabel(tap), <>{volume(tap.nominal_bbl)} · on <time dateTime={tap.opened_at} title={formatDateTime(tap.opened_at, timeZone)}>{formatWeekday(tap.opened_at, timeZone)}</time> · {actor(tap.opened_by_label)} · opened {Math.round(Number(tap.opening_fill) * 100)}%{tap.not_in_inventory ? " · not in taproom stock · excluded from variance" : ""}</>, tap.not_in_inventory ? 1 : 0, undefined, undefined, actions(tap)]))}
      {state.snapshot.open.filter(tap => !tap.sku_id).map(tap => <div key={tap.id}>{E.row(`${tap.tap_number ?? "unnumbered"} · ${tapLabel(tap)} · keg`, `nominal ${volume(tap.nominal_bbl)} · on ${formatDateTime(tap.opened_at, timeZone)} by ${actor(tap.opened_by_label)} · opened ${Math.round(Number(tap.opening_fill) * 100)}%${tap.not_in_inventory ? " · not in taproom stock · excluded from variance" : ""} · no guest yield`, actions(tap), "w")}</div>)}
    </>}
    {E.info("Unnumbered kegs sort last.")}
    {recent.map((event, index) => <div key={index}>{E.row(event.title, event.detail)}</div>)}
    {E.ttl("Recent history")}
    {state.snapshot.history.length === 0 ? E.blank("No closed kegs yet.") : state.snapshot.history.map(tap => <div key={tap.id}>{E.row(`Tap ${tap.tap_number ?? "unnumbered"} · ${tapLabel(tap)}`, `${tap.close_reason} · ${Math.round(Number(tap.closing_fill) * 100)}% left · closed ${formatDateTime(tap.closed_at, timeZone)} by ${actor(tap.closed_by_label)}`)}</div>)}
    {E.note("With no usable POS numerator, a row shows what is on and since when, with no bar. Guest labels are never matched to POS. Nothing on this board posts to the ledger; the weekly count does that.")}
  </>;
}
