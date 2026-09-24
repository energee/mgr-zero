"use client";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OrderQuantity } from "@/components/mgr/views/new-order";
import { LinkTabs } from "@/components/mgr/work-tabs";
import { varianceBbl } from "@/lib/mgr/taproom-variance-view";
import { countBrandComparison, projectionExpectedText, projectionMatchesCountDraft, updateCountQuantity, updateCorrectionQuantity, updateCorrectionReason, type TaproomCountState } from "@/lib/mgr/taproom-count-state";
import type { TaproomCorrectionState } from "@/lib/mgr/taproom-count-state";
const bbl = (value: number | null) => value === null ? "unavailable" : varianceBbl(value);

export function WeeklyCountPrintAction({ busy = false, empty = false, error, onPrint }: { busy?: boolean; empty?: boolean; error?: string | null; onPrint?: () => void }) {
  return <div className="flex flex-wrap items-center gap-3 print:hidden"><Button type="button" variant="ghost" disabled={busy} onClick={onPrint}>{busy ? "Checking stock…" : "Print current stock labels"}</Button>{empty && <span className="text-sm text-muted-foreground">No current positive stock to print.</span>}<CommandFormMessage error={error} /></div>;
}

export type WeeklyCountViewModel = {
  backHref?: string; boardHref?: string; varianceHref?: string; locations: [string, string?][]; location: string;
  draft?: TaproomCountState; role: "admin" | "warehouse" | "taproom"; lotLabels: Record<string, string>;
  receipt?: { date: string; recorded: string; priorHref?: string; correction?: string; correctionForm?: TaproomCorrectionState; canCorrect: boolean; lines: { key: string; name: string; detail: string; result: string }[] };
  history: { key: string; date: string; detail: string; href?: string }[];
  /** breweries.timezone: the server renders these client views first, so both sides format in it (#442). */
  timeZone: string;
};

export function WeeklyCountView({ model, draft, correction }: { model: WeeklyCountViewModel; draft?: ReactNode; correction?: ReactNode }) {
  return <>
    <div className="contents print:hidden">
      {E.back("Beer", "Weekly count", undefined, model.backHref)}
      {(model.boardHref || model.varianceHref) && <div className="flex flex-wrap gap-3 text-sm">{model.boardHref && <Link className="underline" href={model.boardHref}>Tap board</Link>}{model.varianceHref && <Link className="underline" href={model.varianceHref}>Variance by brand</Link>}</div>}
      {model.locations.length > 0 && (model.locations.some(([, href]) => href) ? <LinkTabs items={model.locations.map(([name, href]) => [name, href ?? "#"])} current={model.location} className="w-full" /> : E.tabs(model.locations.map(([name]) => name), model.locations.findIndex(([name]) => name === model.location), "w-full"))}
    </div>
    {model.locations.length === 0 ? E.blank("No taproom locations yet. Ask Admin to add one under Locations.") : <>
      {draft !== undefined ? draft : model.draft && <WeeklyCountDraftView state={model.draft} role={model.role} lotLabels={model.lotLabels} timeZone={model.timeZone} />}
      <div className="contents print:hidden">
        {model.receipt && <section aria-label="Saved count" className="flex flex-col gap-3">
          {E.ttl(`Saved count · ${model.receipt.date}`)}
          {E.note(<>{model.receipt.recorded}{model.receipt.priorHref && <> · <Link href={model.receipt.priorHref}>prior count</Link></>}</>)}
          {model.receipt.correction && E.note(model.receipt.correction)}
          {model.receipt.lines.map(line => <div key={line.key}>{E.row(line.name, line.detail, <span className="break-all text-xs">{line.result}</span>)}</div>)}
          {model.role === "admin" && model.receipt.canCorrect && (correction !== undefined ? correction : model.receipt.correctionForm && <WeeklyCountCorrectionView state={model.receipt.correctionForm} />)}
        </section>}
        {E.ttl("Recent saved counts")}
        <p className="text-sm text-muted-foreground">Newest 50 at this taproom.</p>
        {model.history.length === 0 ? E.blank("No saved counts yet") : model.history.map(count => <div key={count.key}>{E.row(`Weekly count · ${count.date}`, count.detail, E.act("Open count", "primary", count.href))}</div>)}
        {E.note("Admin can correct only the latest saved count when a quantity was counted too low. Warehouse and Taproom read the correction history without the action. The original receipt remains in the audit trail.")}
      </div>
    </>}
  </>;
}

export function WeeklyCountDraftView({ state: controlledState, role, lotLabels, timeZone, priorHref, print, projectionBusy = false, projectionError, onRefreshExpected, onRefreshSnapshot, onQuantity, onSubmit }: {
  state: TaproomCountState; role: "admin" | "warehouse" | "taproom"; lotLabels: Record<string, string>; timeZone: string; priorHref?: string; print?: ReactNode;
  projectionBusy?: boolean; projectionError?: string | null; onRefreshExpected?: () => void; onRefreshSnapshot?: () => void;
  onQuantity?: (key: string, value: string) => void; onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [internalState, setInternalState] = useState(controlledState);
  const state = onQuantity ? controlledState : internalState;
  const changeQuantity = onQuantity ?? ((key: string, value: string) => setInternalState(current => updateCountQuantity(current, key, value)));
  const locked = state.attempt.kind === "unknown" || state.attempt.kind === "submitting" || state.attempt.kind === "stale";
  const aligned = projectionMatchesCountDraft(state);
  const projection = state.projection as { expected_bbl: number | null; starts_at?: string | null; as_of?: string; reason?: string | null; unmapped_lines?: number; ignored_lines?: number; excluded_bbl?: number; unattributed_bbl?: number; coverage_complete?: boolean } | null;
  const expected = projectionExpectedText(projection ?? { expected_bbl: null });
  const prior = state.draft.priorCount;
  const comparison = countBrandComparison(state);
  return <>
    <div className="contents print:hidden">
    {E.ttl("Expected consumption")}
    {E.note(prior ? <>Captured prior · {priorHref ? <Link href={priorHref}>{formatDate(prior.counted_on)}</Link> : formatDate(prior.counted_on)} · reopen saved count</> : "Captured prior · first count")}
    {!aligned ? <CommandFormMessage tone="warning">Expected comparison unavailable because a newer saved count changed its baseline. {state.attempt.kind === "unknown" || state.attempt.kind === "submitting" ? "Recover the frozen submission before starting a fresh recount." : "Start a fresh recount."}</CommandFormMessage>
      : expected ? <p className="text-sm">Expected total {expected}</p> : <p className="text-sm">Expected consumption unavailable · {(projection?.reason ?? "no usable POS observation").replaceAll("_", " ")}</p>}
    {aligned && projection?.starts_at && projection.as_of && <p className="text-xs text-muted-foreground">{formatDateTime(projection.starts_at, timeZone)} through {formatDateTime(projection.as_of, timeZone)}</p>}
    {comparison.map(row => <div key={row.brandId}>{E.row(row.brandName, `expected ${bbl(row.expectedBbl)} · draft actual ${row.complete ? bbl(row.actualBbl) : "Enter all buckets"}`, `difference ${bbl(row.differenceBbl)}`)}</div>)}
    {comparison.length > 0 && <p className="text-xs text-muted-foreground">Draft actual is an estimate from this snapshot&apos;s package volumes. Expected minus actual is a comparison only; the saved receipt is authoritative.</p>}
    {aligned && projection && ((projection.unmapped_lines ?? 0) > 0 || (projection.ignored_lines ?? 0) > 0 || Number(projection.excluded_bbl) > 0 || Number(projection.unattributed_bbl) > 0) && <p className="text-xs text-muted-foreground">Coverage {projection.coverage_complete ? "complete" : "incomplete"} · {projection.unmapped_lines} unmapped · {projection.ignored_lines} ignored · {projection.excluded_bbl} bbl excluded · {projection.unattributed_bbl} bbl unattributed</p>}
    <Button type="button" variant="ghost" disabled={projectionBusy || locked || !aligned} onClick={onRefreshExpected}>{projectionBusy ? "Refreshing…" : "Refresh expected"}</Button>
    <CommandFormMessage error={projectionError} />
    </div>
    <form onSubmit={event => { event.preventDefault(); onSubmit?.(event); }} className="flex flex-col gap-3" aria-label="Count every stock bucket">
      <div className="contents print:hidden">
      {E.ttl("Count every stock bucket")}
      {E.note(`Server date ${formatDate(state.draft.countedOn)} · whole remaining packages only · enter zero explicitly. A partly full keg is one.`)}
      </div>
      {print !== undefined ? print : <WeeklyCountPrintAction />}
      <div className="contents print:hidden">
      {E.note("Print includes only current positive stock and keeps the captured worksheet row numbers.")}
      {state.draft.lines.some(line => line.lotId !== null) && role === "taproom" && E.note("Tracked lots use the full worksheet row numbers shown here. Use Print current stock labels before counting; do not guess a lot.")}
      {state.draft.lines.length === 0 && E.blank("No stock buckets are recorded at this taproom. Saving records an empty observation.")}
      <fieldset disabled={locked} className="contents">
        {state.draft.lines.map((line, index) => {
          const lot = line.lotId ? (role === "taproom" ? `Tracked worksheet row ${index + 1}` : `Lot ${lotLabels[line.key] ?? "label unavailable"} · worksheet row ${index + 1}`) : `Untracked stock · worksheet row ${index + 1}`;
          return <div key={line.key}>{E.row(line.skuName, `${line.binName} · ${lot} · recorded ${line.qtyBefore}`, <OrderQuantity label={`Remaining units · ${line.skuName} · worksheet row ${index + 1}`} value={line.quantity} max={line.qtyBefore} step="1" required invalid={state.attempt.kind === "error"} onChange={value => changeQuantity(line.key, value)} />, line.quantity !== "" && Number(line.quantity) < line.qtyBefore ? "w" : "")}</div>;
        })}
      </fieldset>
      {state.attempt.kind === "unknown" && <CommandFormMessage tone="warning">No trustworthy response arrived. The request ID and every quantity are frozen. Retry this unchanged count to recover its original result.</CommandFormMessage>}
      {state.attempt.kind === "stale" && <CommandFormMessage error={state.attempt.message}>This count is out of date. Start a fresh recount; entered quantities will be cleared.</CommandFormMessage>}
      {state.attempt.kind === "error" && <CommandFormMessage error={state.attempt.message} />}
      <div className="flex flex-col gap-2 md:flex-row md:justify-end">
        {state.attempt.kind === "stale" && <Button type="button" variant="outline" onClick={onRefreshSnapshot}>Start fresh recount</Button>}
        <Button type="submit" disabled={state.attempt.kind === "submitting" || state.attempt.kind === "stale"}>{state.attempt.kind === "unknown" ? "Retry unchanged count" : state.attempt.kind === "submitting" ? "Recording…" : "Record count"}</Button>
      </div>
      </div>
    </form>
  </>;
}

export function WeeklyCountCorrectionView({ state: controlledState, open: controlledOpen, onOpenChange, onSubmit, onQuantity, onReason }: {
  state: TaproomCorrectionState; open?: boolean; onOpenChange?: (open: boolean) => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void; onQuantity?: (id: string, quantity: string) => void; onReason?: (reason: string) => void;
}) {
  const [internalState, setInternalState] = useState(controlledState);
  const state = onQuantity || onReason ? controlledState : internalState;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const formId = useId();
  const locked = state.attempt.kind === "submitting" || state.attempt.kind === "unknown" || state.attempt.kind === "saved";
  return <CommandForm
    open={open}
    onOpenChange={next => { if (next || !locked) { setInternalOpen(next); onOpenChange?.(next); } }}
    trigger={<Button type="button" variant="outline" disabled={state.attempt.kind === "saved"}>{state.attempt.kind === "saved" ? "Correction saved" : "Correct count"}</Button>}
    title="Correct saved count"
    footer={<CommandFormFooter>
      <Button type="submit" form={formId} disabled={state.attempt.kind === "submitting" || state.attempt.kind === "saved"}>
        {state.attempt.kind === "unknown" ? "Retry unchanged correction" : state.attempt.kind === "submitting" ? "Correcting…" : state.attempt.kind === "saved" ? "Correction saved" : "Save correction"}
      </Button>
    </CommandFormFooter>}
  >
    <form id={formId} onSubmit={event => { event.preventDefault(); onSubmit?.(event); }} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Increase only the quantities that were counted too low. Recorded stock and the original count stay unchanged in the audit trail.</p>
      {state.lines.map((line, index) => <div key={line.id} className="grid gap-2 rounded-xl border p-3 md:grid-cols-[1fr_8rem] md:items-end">
        <div>
          <p className="font-medium">{line.sku_name ?? "Saved SKU"}</p>
          <p className="text-sm text-muted-foreground">{line.bin_name ?? "Saved bin"} · saved row {index + 1} · {line.lot_id ? `tracked lot ${line.lot_id}` : "untracked stock"} · counted {line.qty_counted} · recorded before {line.qty_before}</p>
        </div>
        {E.edit("Corrected units", line.quantity, "number", undefined, { onChange: (nextValue: string) => { const value = nextValue; if (onQuantity) onQuantity(line.id, value); else setInternalState(current => updateCorrectionQuantity(current, line.id, value)); }, id: `correction-${state.countId}-${index}`, disabled: locked || line.qty_counted === line.qty_before, min: line.qty_counted, max: line.qty_before, step: "1", inputMode: "numeric" })}
      </div>)}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`correction-reason-${state.countId}`}>Reason</Label>
        <Textarea id={`correction-reason-${state.countId}`} value={state.reason} disabled={locked} onChange={event => { const value = event.target.value; if (onReason) onReason(value); else setInternalState(current => updateCorrectionReason(current, value)); }} required />
      </div>
      {state.attempt.kind === "unknown" && <CommandFormMessage tone="warning">No trustworthy response arrived. The request ID, reason, and corrected quantities are frozen. Retry unchanged to recover the original result.</CommandFormMessage>}
      {state.attempt.kind === "error" && <CommandFormMessage error={state.attempt.message} />}
    </form>
  </CommandForm>;
}
