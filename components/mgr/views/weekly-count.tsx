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
import { ScopePick, type ScopeOption } from "@/components/mgr/scope-pick";
import { varianceBbl, varianceReason } from "@/lib/mgr/taproom-variance-view";
import { countBrandComparison, countLocked, countQuantityError, countSubmitReason, isShortage, projectionExpectedText, projectionMatchesCountDraft, updateCountDisposition, updateCountQuantity, updateCorrectionQuantity, updateCorrectionReason, worksheetOrder, type TaproomCountState } from "@/lib/mgr/taproom-count-state";
import type { TaproomCorrectionState } from "@/lib/mgr/taproom-count-state";
import type { StaffRole } from "@/lib/commands/registry";
import { hasAnyRole, onlyRoles } from "@/lib/mgr/roles";
import { useTouchedLines } from "@/lib/mgr/touched-lines";
const bbl = (value: number | null) => value === null ? "unavailable" : varianceBbl(value);

export function WeeklyCountPrintAction({ busy = false, empty = false, error, onPrint }: { busy?: boolean; empty?: boolean; error?: string | null; onPrint?: () => void }) {
  const emptyReasonId = useId();
  return <div className="flex flex-wrap items-center gap-3 print:hidden">
    <Button type="button" variant="outline" disabled={busy || empty} aria-describedby={empty ? emptyReasonId : undefined} onClick={onPrint}>{busy ? "Checking stock…" : "Print current stock labels"}</Button>
    {empty && <span id={emptyReasonId} className="text-sm text-muted-foreground">No current positive stock to print.</span>}
    <CommandFormMessage error={error} />
  </div>;
}

export type WeeklyCountViewModel = {
  backHref?: string; boardHref?: string; varianceHref?: string; worksheetHref?: string;
  /** Taprooms; `location` is the selected option's value (a location id live). */
  locations: ScopeOption[]; location: string;
  draft?: TaproomCountState; roles: readonly StaffRole[]; lotLabels: Record<string, string>;
  receipt?: { date: string; recorded: string; priorHref?: string; correction?: string; correctionForm?: TaproomCorrectionState; canCorrect: boolean; lines: { key: string; name: string; detail: string; result: string }[] };
  history: { key: string; date: string; detail: string; href?: string }[];
  /** breweries.timezone: the server renders these client views first, so both sides format in it (#442). */
  timeZone: string;
};

export function WeeklyCountView({ model, draft, correction, onWorksheet }: { model: WeeklyCountViewModel; draft?: ReactNode; correction?: ReactNode; onWorksheet?: () => void }) {
  return <>
    <div className="contents print:hidden">
      {E.back("Beer", "Weekly count", undefined, model.backHref)}
      {(model.boardHref || model.varianceHref) && <div className="flex flex-wrap gap-3 text-sm">{model.boardHref && <Link className="underline" href={model.boardHref}>Tap board</Link>}{model.varianceHref && <Link className="underline" href={model.varianceHref}>Variance by brand</Link>}</div>}
      {model.locations.length > 0 && <ScopePick label="Location" value={model.location} options={model.locations} />}
    </div>
    {model.locations.length === 0 ? E.blank("No taproom locations yet. Ask Admin to add one under Locations.") : <>
      {!model.receipt && (draft !== undefined ? draft : model.draft && <WeeklyCountDraftView state={model.draft} roles={model.roles} lotLabels={model.lotLabels} timeZone={model.timeZone} />)}
      <div className="contents print:hidden">
        {model.receipt && <section aria-label="Saved count" className="flex flex-col gap-3">
          {E.ttl(`Saved count · ${model.receipt.date}`)}
          <p className="text-sm text-muted-foreground">{model.receipt.recorded}{model.receipt.priorHref && <>. <Link href={model.receipt.priorHref}>Open the previous count</Link></>}</p>
          {model.receipt.correction && <p className="text-sm text-muted-foreground">{model.receipt.correction}</p>}
          {model.receipt.lines.map(line => <div key={line.key}>{E.row(line.name, line.detail, <span className="break-all text-xs">{line.result}</span>)}</div>)}
          {hasAnyRole(model.roles, ["admin"]) && model.receipt.canCorrect && (correction !== undefined ? correction : model.receipt.correctionForm && <WeeklyCountCorrectionView state={model.receipt.correctionForm} />)}
          <Button variant="outline" className="self-start" asChild><Link href={model.worksheetHref ?? "#"} data-to="Weekly count" onClick={onWorksheet ? event => { event.preventDefault(); event.stopPropagation(); onWorksheet(); } : undefined}>Count worksheet</Link></Button>
        </section>}
        {E.ttl("Recent saved counts")}
        <p className="text-sm text-muted-foreground">Newest 50 at this taproom.</p>
        {model.history.length === 0 ? E.blank("No saved counts yet") : model.history.map(count => <div key={count.key}>{E.nav(`Weekly count · ${count.date}`, count.detail, "", undefined, count.href)}</div>)}
        {E.info("Admin only: correct the latest count once, for sold quantities counted too low or too high. Corrections appear in history; the original stays in the audit trail.")}
      </div>
    </>}
  </>;
}

export function WeeklyCountDraftView({ state: controlledState, roles, lotLabels, timeZone, priorHref, print, projectionBusy = false, projectionError, onRefreshExpected, onRefreshSnapshot, onQuantity, onDisposition, onSubmit }: {
  state: TaproomCountState; roles: readonly StaffRole[]; lotLabels: Record<string, string>; timeZone: string; priorHref?: string; print?: ReactNode;
  projectionBusy?: boolean; projectionError?: string | null; onRefreshExpected?: () => void; onRefreshSnapshot?: () => void;
  onDisposition?: (key: string, value: "sold" | "destroyed") => void;
  onQuantity?: (key: string, value: string) => void; onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [internalState, setInternalState] = useState(controlledState);
  const formId = useId();
  const touched = useTouchedLines(!onQuantity);
  const state = onQuantity ? controlledState : internalState;
  const changeQuantity = onQuantity ?? ((key: string, value: string) => setInternalState(current => updateCountQuantity(current, key, value)));
  const changeDisposition = onDisposition ?? ((key: string, value: "sold" | "destroyed") => setInternalState(current => updateCountDisposition(current, key, value)));
  const locked = countLocked(state);
  const aligned = projectionMatchesCountDraft(state);
  const projection = state.projection as { expected_bbl: number | null; starts_at?: string | null; as_of?: string; reason?: string | null; unmapped_lines?: number; ignored_lines?: number; excluded_bbl?: number; unattributed_bbl?: number; coverage_complete?: boolean } | null;
  const expected = projectionExpectedText(projection ?? { expected_bbl: null });
  const prior = state.draft.priorCount;
  // A brand with no expectation has nothing to compare, so it draws no row (#1516).
  const comparison = countBrandComparison(state).filter(row => row.expectedBbl !== null);
  // With no expectation the block has nothing to compare, so it follows the count inputs; a changed baseline stays on top (#1516).
  const expectationBelow = aligned && !expected;
  const expectation = <div className="contents print:hidden">
    {E.ttl("Expected consumption")}
    {prior && <p className="text-xs text-muted-foreground">Last count {priorHref ? <Link href={priorHref}>{formatDate(prior.counted_on)}</Link> : formatDate(prior.counted_on)}</p>}
    {!aligned ? <CommandFormMessage tone="warning">Expected comparison unavailable because a newer saved count changed its baseline. {state.attempt.kind === "unknown" || state.attempt.kind === "submitting" ? "Recover the frozen submission before starting a fresh recount." : "Start a fresh recount."}</CommandFormMessage>
      : expected ? <p className="text-sm">Expected total {expected}</p> : <p className="text-sm">Expected consumption unavailable.{projection?.reason && ` ${varianceReason(projection.reason)}.`}</p>}
    {aligned && projection?.starts_at && projection.as_of && <p className="text-xs text-muted-foreground">{formatDateTime(projection.starts_at, timeZone)} through {formatDateTime(projection.as_of, timeZone)}</p>}
    {comparison.map(row => <div key={row.brandId}>{E.row(row.brandName, `expected ${bbl(row.expectedBbl)} · draft actual ${row.complete ? bbl(row.actualBbl) : "Enter all buckets"}`, `difference ${bbl(row.differenceBbl)}`)}</div>)}
    {comparison.length > 0 && <p className="text-xs text-muted-foreground">Draft actual is an estimate from this snapshot&apos;s package volumes. Expected minus actual is a comparison only; the saved receipt is authoritative.</p>}
    {aligned && projection && ((projection.unmapped_lines ?? 0) > 0 || (projection.ignored_lines ?? 0) > 0 || Number(projection.excluded_bbl) > 0 || Number(projection.unattributed_bbl) > 0) && <p className="text-xs text-muted-foreground">Coverage {projection.coverage_complete ? "complete" : "incomplete"} · {projection.unmapped_lines} unmapped · {projection.ignored_lines} ignored · {projection.excluded_bbl} bbl excluded · {projection.unattributed_bbl} bbl unattributed</p>}
    <Button type="button" variant="outline" className="md:self-start" disabled={projectionBusy || locked || !aligned} onClick={onRefreshExpected}>{projectionBusy ? "Refreshing…" : "Refresh expected"}</Button>
    <CommandFormMessage error={projectionError} />
    </div>;
  return <>
    {!expectationBelow && expectation}
    <form noValidate onSubmit={event => { event.preventDefault(); if (!countSubmitReason(state)) onSubmit?.(event); }} className="flex flex-col gap-3" aria-label="Count every stock bucket">
      <div className="contents print:hidden">
      {E.ttl("Count every stock bucket")}
      {E.info(`Count whole packages for ${formatDate(state.draft.countedOn)}; a partly full keg counts as one. Enter 0 for none.`)}
      </div>
      {print !== undefined ? print : <WeeklyCountPrintAction empty={!state.draft.lines.some(line => line.qtyBefore > 0)} />}
      <div className="contents print:hidden">
      {state.draft.lines.some(line => line.lotId !== null) && onlyRoles(roles, ["taproom"]) && E.note("Tracked lots use the full worksheet row numbers shown here. Use Print current stock labels before counting; do not guess a lot.")}
      {state.draft.lines.length === 0 && E.blank("No stock is recorded at this taproom. Record count saves a count of zero for today. Your next count compares against it.")}
      <fieldset disabled={locked} className="contents">
        {worksheetOrder(state.draft.lines).map(({ line, row }) => {
          // An untracked bucket needs no worksheet row: only tracked lots match a printed label by it.
          const lot = line.lotId ? (onlyRoles(roles, ["taproom"]) ? `Tracked worksheet row ${row}` : `Lot ${lotLabels[line.key] ?? "label unavailable"} · worksheet row ${row}`) : null;
          const error = touched.shown(row - 1) ? countQuantityError(line) : undefined;
          return <div key={line.key}>
            {E.row(line.skuName, [line.binName, lot, `recorded ${line.qtyBefore}`].filter(Boolean).join(" · "), <div className="flex items-center gap-1">
              {/* Fills this one bucket on request; quantities never start at the recorded stock. */}
              <Button type="button" variant="ghost" size="sm" aria-label={`Same as recorded · ${line.skuName} · worksheet row ${row}`} onClick={() => { touched.touch(row - 1); changeQuantity(line.key, String(line.qtyBefore)); }}>Same as recorded</Button>
              <OrderQuantity
                id={`${formId}-${row - 1}`} label={`Remaining units · ${line.skuName} · worksheet row ${row}`}
                value={line.quantity} max={line.qtyBefore} step="1" required
                invalid={state.attempt.kind === "error"} error={error}
                onBlur={() => touched.touch(row - 1)}
                onChange={value => changeQuantity(line.key, value)}
              />
            </div>, isShortage(line) ? "w" : "")}
            {isShortage(line) && E.pick(`Shortage disposition · worksheet row ${row}`, line.disposition ?? "sold", [{ value: "sold", label: "Sold" }, { value: "destroyed", label: "Destroyed" }], { disabled: locked, onChange: value => changeDisposition(line.key, value as "sold" | "destroyed") })}
          </div>;
        })}
      </fieldset>
      {state.attempt.kind === "unknown" && <CommandFormMessage tone="warning">No trustworthy response arrived. The request ID and every quantity are frozen. Retry this unchanged count to recover its original result.</CommandFormMessage>}
      {state.attempt.kind === "stale" && <CommandFormMessage error={state.attempt.message}>This count is out of date. Start a fresh recount; entered quantities will be cleared.</CommandFormMessage>}
      {state.attempt.kind === "error" && <CommandFormMessage error={state.attempt.message} />}
      <div className="flex flex-col gap-2 md:flex-row md:justify-end">
        {state.attempt.kind === "stale" && <Button type="button" variant="outline" onClick={onRefreshSnapshot}>Start fresh recount</Button>}
        {E.submit(state.attempt.kind === "unknown" ? "Retry unchanged count" : state.attempt.kind === "submitting" ? "Recording…" : "Record count", { id: `${formId}-submit`, reason: countSubmitReason(state), submitting: state.attempt.kind === "submitting" })}
      </div>
      </div>
    </form>
    {expectationBelow && expectation}
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
      <p className="text-sm text-muted-foreground">Correct quantities counted too low or too high, from zero through the recorded stock before the count. The original count stays unchanged in the audit trail.</p>
      {state.lines.map((line, index) => <div key={line.id} className="grid gap-2 rounded-xl border p-3 md:grid-cols-[1fr_8rem] md:items-end">
        <div>
          <p className="font-medium">{line.sku_name ?? "Saved SKU"}</p>
          <p className="text-sm text-muted-foreground">{line.bin_name ?? "Saved bin"} · saved row {index + 1} · {line.lot_id ? `tracked lot ${line.lot_code}` : "untracked stock"} · counted {line.qty_counted} · recorded before {line.qty_before}</p>
        </div>
        {E.edit("Corrected units", line.quantity, "number", undefined, { onChange: (nextValue: string) => { const value = nextValue; if (onQuantity) onQuantity(line.id, value); else setInternalState(current => updateCorrectionQuantity(current, line.id, value)); }, id: `correction-${state.countId}-${index}`, disabled: locked || line.movement_type === "destruction" || line.qty_before === 0, min: 0, max: line.qty_before, step: "1", inputMode: "numeric" })}
        {line.movement_type === "destruction" && <p className="text-sm text-muted-foreground">Destroyed shortages cannot be corrected.</p>}
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
