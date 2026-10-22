// components/mgr/views/tap-board.tsx — Tap board and its Tap / Kick / Swap
// sheet, shared by the inventory and /taproom/board. The sheet's submit is
// withheld with a reason, and a left guest field is marked, from one rule set
// (tapSheetNeeds); an empty keg SKU picker says where keg SKUs are made (#1114).
"use client";
import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { E, type PickEmpty } from "@/components/mgr/e";
import { FieldDescription } from "@/components/ui/field";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import { formatDateTime, formatWeekday } from "@/lib/date-format";
import { bblExact } from "@/lib/volume";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { ScopePick, type ScopeOption } from "@/components/mgr/scope-pick";
import { tapLabel, tapSheetNeeds, tapSheetReason, openTapBoardSheet, editTapBoardSheet, type TapBoardState, type TapBoardSheet, type TapSheetFields, type TapInterval } from "@/lib/mgr/tap-board-state";

export type TapSku = { id: string; name: string; nominalBbl: number };
const volume = (value: number) => bblExact(value, 4);
const actor = (label: string | null) => label ? `@${label}` : "staff";
// Labels only: the stored fills are fixed by the tap_intervals CHECK constraints.
const fills = [[.25, "25%"], [.5, "50%"], [.6, "60%"], [1, "Full"]] as const;
const closingFills = [[0, "Empty"], [.25, "About ¼ left"], [.5, "About ½ left"]] as const;

const VERBS = { tap: "Tap keg", kick: "Kick keg", swap: "Swap · one record" } as const;

function fillChips<Fill extends number>(label: string, options: readonly (readonly [Fill, string])[], value: Fill, onChange: (fill: Fill) => void) {
  return E.chips(options.map(([, text]) => text), options.findIndex(([fill]) => fill === value), false, { label, onChange: index => onChange(options[index][0]) });
}

/** The keg SKU picker with nothing to offer. `skusHref` is Catalog for a user
 *  who may create a SKU, null for one who may not; the inventory leaves it out. */
const noKegSkus = (skusHref: string | null | undefined): PickEmpty => skusHref === null
  ? { text: "No keg SKUs to tap yet. Guest keg is still available. An admin or sales member adds keg SKUs in Catalog." }
  : { text: "No keg SKUs to tap yet. Guest keg is still available.", label: "Add a keg SKU", href: skusHref, to: "Catalog" };

/** `timeZone` is the brewery's: the server renders this client view first, so both sides must format in one zone (#442). */
export function TapKegView({ sheet: controlledSheet, skus, skusHref, timeZone, onEdit, closedFact, onReload }: { sheet: TapBoardSheet; skus: TapSku[]; skusHref?: string | null; timeZone: string; onEdit?: (fields: Partial<TapSheetFields>) => void; closedFact?: string | null; onReload?: () => void }) {
  const id = useId();
  const [internalSheet, setInternalSheet] = useState(controlledSheet);
  // A guest field's error waits until the user leaves it (#1121).
  const [left, setLeft] = useState<{ guestLabel?: true; guestNominalBbl?: true }>({});
  const sheet = onEdit ? controlledSheet : internalSheet;
  const locked = sheet.attempt.kind === "submitting" || sheet.attempt.kind === "unknown";
  const edit = (patch: Partial<TapSheetFields>) => { if (!locked) { if (onEdit) onEdit(patch); else setInternalSheet(current => ({ ...current, fields: { ...current.fields, ...patch } })); } };
  const needs = tapSheetNeeds(sheet);
  const guestError = (field: "guestLabel" | "guestNominalBbl") => left[field] && needs[field] ? `Enter ${needs[field]}.` : undefined;
  const label = sheet.attempt.kind === "unknown" ? "Retry unchanged" : VERBS[sheet.kind];
  const submit = { submitting: sheet.attempt.kind === "submitting", reason: tapSheetReason(sheet) };
  return <>
    {closedFact && E.row("Already swapped", closedFact, <Button type="button" variant="outline" onClick={onReload}>Reload</Button>, "w")}
    <fieldset disabled={locked} className="flex flex-col gap-3">
      {sheet.interval && <>{E.ttl(sheet.kind === "kick" ? `Kick tap ${sheet.interval.tap_number ?? "unnumbered"}` : "Coming off")}{E.fld(sheet.kind === "kick" ? "Coming off" : `Tap ${sheet.interval.tap_number ?? "unnumbered"}`, `${tapLabel(sheet.interval)} · ${volume(sheet.interval.nominal_bbl)} · on since ${formatDateTime(sheet.interval.opened_at, timeZone)} · ${actor(sheet.interval.opened_by_label)}`)}</>}
      {sheet.kind !== "tap" && <>
        {E.pick("Reason", sheet.fields.reason, (["Kicked empty", "Flavor change", "Quality hold"].map(reason => ({ value: reason, label: reason }))), { id: `${id}-reason`, onChange: (nextValue: string) => edit({ reason: nextValue }) })}
        {E.ttl("Remaining")}
        {fillChips("Remaining", closingFills, sheet.fields.closeFill, closeFill => edit({ closeFill }))}
      </>}
      {sheet.kind !== "kick" && <>
        {E.ttl("Going on")}
        {sheet.fields.identity !== "guest" && E.pick("Packaged keg SKU", sheet.fields.identity === "same" ? sheet.interval?.sku_id ?? "" : sheet.fields.skuId, [...(sheet.fields.identity === "same" && sheet.interval?.sku_id && !skus.some(sku => sku.id === sheet.interval?.sku_id) ? [{ value: sheet.interval.sku_id, label: `${tapLabel(sheet.interval)} · ${volume(sheet.interval.nominal_bbl)}` }] : []), ...(skus.map(sku => ({ value: sku.id, label: sku.name + " · " + (volume(sku.nominalBbl)) })))], { id: `${id}-sku`, placeholder: "Choose a keg", empty: noKegSkus(skusHref), onChange: (nextValue: string) => edit({ identity: "own", skuId: nextValue }), required: true })}
        {E.pick("Identity", String(sheet.fields.identity), [...(sheet.kind === "swap" ? [{ value: "same", label: "Same own SKU", disabled: !sheet.interval?.sku_id }] : []), { value: "own", label: "Own keg" }, { value: "guest", label: "Guest keg" }], { id: `${id}-identity`, onChange: (nextValue: string) => edit({ identity: nextValue as TapSheetFields["identity"] }) })}
        {sheet.fields.identity === "guest" && <>
          {E.edit("Guest keg label", sheet.fields.guestLabel, "text", undefined, { id: `${id}-guest-label`, onChange: (nextValue: string) => edit({ guestLabel: nextValue }), onBlur: () => setLeft(current => ({ ...current, guestLabel: true })), error: guestError("guestLabel"), required: true, maxLength: 200 })}
          {E.edit("Guest nominal BBL", sheet.fields.guestNominalBbl, "number", undefined, { id: `${id}-guest-bbl`, onChange: (nextValue: string) => edit({ guestNominalBbl: nextValue }), onBlur: () => setLeft(current => ({ ...current, guestNominalBbl: true })), error: guestError("guestNominalBbl"), required: true, min: "0", step: "any" })}
        </>}
        <div className="flex min-w-0 flex-col gap-2">
          {E.edit("Tap number · optional", sheet.fields.tapNumber, "text", undefined, { id: `${id}-tap-number`, onChange: (nextValue: string) => edit({ tapNumber: nextValue }), maxLength: 80, "aria-describedby": `${id}-tap-number-help` })}
          <FieldDescription id={`${id}-tap-number-help`}>Two kegs can share a number. A keg left blank sorts last.</FieldDescription>
        </div>
        {E.ttl("Opening fill")}
        {fillChips("Opening fill", fills, sheet.fields.openingFill, openingFill => edit({ openingFill }))}
      </>}
    </fieldset>
    {E.info(`Remaining is a rough observation. ${sheet.kind === "swap" ? "The atomic swap" : "This action"} does not change finished-goods inventory.`)}
    {sheet.attempt.kind === "unknown" && <CommandFormMessage tone="warning">No trustworthy response arrived. The request and fields are frozen; retry unchanged to recover the original result.</CommandFormMessage>}
    {sheet.attempt.kind === "error" && <CommandFormMessage error={sheet.attempt.message} />}
    <CommandFormFooter>{sheet.kind === "swap" ? <IrreversibleSubmit label={label} {...submit} /> : E.submit(label, { ...submit, variant: sheet.kind === "kick" ? "destructive" : "default" })}</CommandFormFooter>
    {sheet.kind === "swap" && E.note("The swap is one record. A half-finished swap is not a state this can reach.")}
  </>;
}

/** `skusHref` is where keg SKUs are made, for the empty keg SKU picker (noKegSkus). */
export type TapBoardNavigation = { backHref?: string; countHref?: string; varianceHref?: string; skusHref?: string | null; locations: ScopeOption[]; location: string };

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
    {(navigation.countHref || navigation.varianceHref) && <div className="flex flex-wrap gap-3 text-sm">{navigation.countHref && <Link className="underline" href={navigation.countHref}>Weekly count</Link>}{navigation.varianceHref && <Link className="underline" href={navigation.varianceHref}>Variance by brand</Link>}</div>}
    {/* Scope first, then the heading right above the list it names. */}
    {navigation.locations.length > 0 && <ScopePick label="Location" value={navigation.location} options={navigation.locations} />}
    <div className="flex items-center justify-between gap-2">{E.ttl("On tap")}<Button type="button" size="sm" disabled={navigation.locations.length === 0} onClick={() => open("tap", null)}>Tap keg</Button></div>
    <CommandForm open={Boolean(sheet)} onOpenChange={next => { if (!next && !locked) { if (onClose) onClose(); else setInternalState(current => ({ ...current, sheet: null })); } }} title={sheet?.kind === "kick" ? "Kick keg" : sheet?.kind === "swap" ? "Swap keg" : "Tap keg"}>
      {sheet && <form onSubmit={event => { event.preventDefault(); onSubmit?.(event); }} className="flex flex-col gap-3"><TapKegView key={sheet.interval?.id ?? "new-tap"} sheet={sheet} skus={skus} skusHref={navigation.skusHref} timeZone={timeZone} onEdit={edit} onReload={onReload} closedFact={closed ? `${tapLabel(closed)} was closed ${formatDateTime(closed.closed_at, timeZone)} by ${actor(closed.closed_by_label)}. Review the board before acting.` : null} /></form>}
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
  </>;
}
