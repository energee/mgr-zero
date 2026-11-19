"use client";
import { Fragment, useId, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OrderQuantity } from "@/components/mgr/views/new-order";
import { ScopePick, type ScopeOption } from "@/components/mgr/scope-pick";
import { RecordTable } from "@/components/mgr/views/record-table";
import { varianceBbl, varianceReason } from "@/lib/mgr/taproom-variance-view";
import { countBrandComparison, countLocked, countQuantityError, countSubmitReason, isShortage, projectionExpectedText, projectionMatchesCountDraft, updateCountDisposition, updateCountQuantity, updateCorrectionQuantity, updateCorrectionReason, packageName, savedLineDetail, worksheetGroups, type TaproomCountState } from "@/lib/mgr/taproom-count-state";
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
  receipt?: { date: string; recorded: string; priorHref?: string; correction?: string; correctionForm?: TaproomCorrectionState; canCorrect: boolean; lines: { key: string; name: string; detail: string; recorded: number; counted: number; result: string }[] };
  history: { key: string; date: string; detail: string; href?: string }[];
  /** breweries.timezone: the server renders these client views first, so both sides format in it (#442). */
  timeZone: string;
};

export function WeeklyCountView({ model, draft, correction, onWorksheet }: { model: WeeklyCountViewModel; draft?: ReactNode; correction?: ReactNode; onWorksheet?: () => void }) {
  return <>
    <div className="contents print:hidden">
      {E.back("Beer", "Weekly count", (model.boardHref || model.varianceHref) && <div className="flex flex-wrap gap-3 text-sm">{model.boardHref && <Link className="underline" href={model.boardHref}>Tap board</Link>}{model.varianceHref && <Link className="underline" href={model.varianceHref}>Variance by brand</Link>}</div>, model.backHref)}
      {/* One taproom is named, not offered as a pick with a single option. */}
      {model.locations.length > 1 ? <ScopePick label="Location" value={model.location} options={model.locations} />
        : model.locations.length === 1 && <p className="text-sm text-muted-foreground">{model.locations[0].label}</p>}
    </div>
    {model.locations.length === 0 ? E.blank("No taproom locations yet. Ask Admin to add one under Locations.") : <>
      {!model.receipt && (draft !== undefined ? draft : model.draft && <WeeklyCountDraftView state={model.draft} roles={model.roles} lotLabels={model.lotLabels} timeZone={model.timeZone} />)}
      <div className="contents print:hidden">
        {model.receipt && <section id="saved-count" aria-label="Saved count" className="flex scroll-mt-4 flex-col gap-3">
          {E.ttl(`Saved count · ${model.receipt.date}`)}
          <p className="text-sm text-muted-foreground">{model.receipt.recorded}{model.receipt.priorHref && <>. <Link href={model.receipt.priorHref}>Open the previous count</Link></>}</p>
          {model.receipt.correction && <p className="text-sm text-muted-foreground">{model.receipt.correction}</p>}
          {model.receipt.lines.length > 0 && <RecordTable sortable={false} headers={["Stock", "Recorded", "Counted", "Result"]} align={["l", "r", "r", "l"]}
            rows={model.receipt.lines.map(line => ({ key: line.key, href: null, note: line.detail || undefined, cells: [line.name, line.recorded, line.counted, line.result] }))} />}
          {hasAnyRole(model.roles, ["admin"]) && model.receipt.canCorrect && (correction !== undefined ? correction : model.receipt.correctionForm && <WeeklyCountCorrectionView state={model.receipt.correctionForm} />)}
          <Button variant="outline" className="self-start" asChild><Link href={model.worksheetHref ?? "#"} data-to="Weekly count" onClick={onWorksheet ? event => { event.preventDefault(); event.stopPropagation(); onWorksheet(); } : undefined}>Count worksheet</Link></Button>
        </section>}
        {E.ttl("Recent saved counts")}
        {model.history.length === 0 ? E.blank("No saved counts yet") : model.history.map(count => <div key={count.key}>{E.nav(count.date, count.detail, "", undefined, count.href)}</div>)}
        {hasAnyRole(model.roles, ["admin"]) && E.info("Admin only: correct the latest count once, for sold quantities counted too low or too high. Corrections appear in history; the original stays in the audit trail.")}
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
  const lines = state.draft.lines;
  // One bin for every bucket is said once above the rows, not on each.
  const sharedBin = lines.length > 1 && lines.every(line => line.binName === lines[0].binName) ? lines[0].binName : null;
  const groups = worksheetGroups(lines);
  const reason = countSubmitReason(state);
  const next = groups.flatMap(group => group.rows).find(({ line }) => countQuantityError(line));
  // Hide counted leaves out the buckets counted when it was switched on; one counted after that stays
  // in place, so a row never disappears under the hand typing in it.
  const [hidden, setHidden] = useState<ReadonlySet<string> | null>(null);
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
      <div className="flex items-end justify-between gap-3">
        {E.ttl("Count every stock bucket")}
        {lines.length > 1 && <label className="flex items-center gap-2 text-sm text-muted-foreground">Hide counted{E.sw(hidden !== null, "Hide counted", on => setHidden(on ? new Set(lines.filter(line => !countQuantityError(line)).map(line => line.key)) : null))}</label>}
      </div>
      {E.info(`Count whole packages for ${formatDate(state.draft.countedOn)}; a partly full keg counts as one. Enter 0 for none.${sharedBin ? ` Every bucket is in ${sharedBin}.` : ""}`)}
      </div>
      {print !== undefined ? print : <WeeklyCountPrintAction empty={!state.draft.lines.some(line => line.qtyBefore > 0)} />}
      <div className="contents print:hidden">
      {state.draft.lines.some(line => line.lotId !== null) && onlyRoles(roles, ["taproom"]) && E.note("A worksheet row number matches a printed label. Print current stock labels before counting; do not guess.")}
      {state.draft.lines.length === 0 && E.blank("No stock is recorded at this taproom. Record count saves a count of zero for today. Your next count compares against it.")}
      <fieldset disabled={locked} className="contents">
        {groups.map(group => ({ ...group, rows: group.rows.filter(({ line }) => !hidden?.has(line.key)) })).filter(group => group.rows.length > 0).map(group => <Fragment key={group.brandId}>{E.group(group.brandName)}{group.rows.map(({ line, row }) => {
          const where = savedLineDetail({ bin_name: line.binName, lot_id: line.lotId, lot_code: lotLabels[line.key] ?? null }, row, { showBin: !sharedBin, showLotCode: !onlyRoles(roles, ["taproom"]) });
          const error = touched.shown(row - 1) ? countQuantityError(line) : undefined;
          const short = isShortage(line) ? line.qtyBefore - Number(line.quantity) : 0;
          // On a phone the controls take their own line, so the name and its facts keep the full width.
          // A counted bucket's name goes quiet, so the ones still to count stand out.
          return <div key={line.key} className={cn("max-md:[&_[data-slot=item-actions]]:basis-full max-md:[&_[data-slot=item-actions]]:justify-end", !countQuantityError(line) && "[&_[data-slot=item-title]]:font-normal [&_[data-slot=item-title]]:text-muted-foreground")}>
            {E.row(packageName(line), [where, `recorded ${line.qtyBefore}`].filter(Boolean).join(" · "), <div className="flex items-center gap-2">
              {short > 0 && <span aria-label={`${short} short of recorded`} className="text-sm tabular-nums text-muted-foreground">{`−${short}`}</span>}
              {/* Fills this one bucket on request, and shows the number it fills; quantities never start at the recorded stock. */}
              <Button type="button" variant="secondary" size="sm" className="tabular-nums" title="Same as recorded" aria-label={`Same as recorded · ${line.skuName} · worksheet row ${row}`} onClick={() => { touched.touch(row - 1); changeQuantity(line.key, String(line.qtyBefore)); }}>{`= ${line.qtyBefore}`}</Button>
              <OrderQuantity
                id={`${formId}-${row - 1}`} label={`Remaining units · ${line.skuName} · worksheet row ${row}`}
                value={line.quantity} max={line.qtyBefore} step="1" required
                invalid={state.attempt.kind === "error"} error={error}
                onBlur={() => touched.touch(row - 1)}
                onChange={value => changeQuantity(line.key, value)}
              />
            </div>, short > 0 ? "w" : "")}
            {short > 0 && E.pick(`Missing ${short} · ${packageName(line)}`, line.disposition ?? "sold", [{ value: "sold", label: "Sold" }, { value: "destroyed", label: "Destroyed" }], { disabled: locked, onChange: value => changeDisposition(line.key, value as "sold" | "destroyed") })}
          </div>;
        })}</Fragment>)}
      </fieldset>
      {state.attempt.kind === "unknown" && <CommandFormMessage tone="warning">No trustworthy response arrived. The request ID and every quantity are frozen. Retry this unchanged count to recover its original result.</CommandFormMessage>}
      {state.attempt.kind === "stale" && <CommandFormMessage error={state.attempt.message}>This count is out of date. Start a fresh recount; entered quantities will be cleared.</CommandFormMessage>}
      {state.attempt.kind === "error" && <CommandFormMessage error={state.attempt.message} />}
      {/* Record count stays in view down a long worksheet, beside what it still needs; that
          sentence goes to the next uncounted bucket (as Prep's goes to its line). The shadow paints
          the page's bottom padding, so no row shows under the bar (as the Brand footer does);
          the margin keeps that shadow off whatever follows the worksheet. */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 mb-8 border-t bg-background py-3 shadow-[0_2rem_0_var(--background)]">
        {state.attempt.kind === "stale" && <Button type="button" variant="outline" onClick={onRefreshSnapshot}>Start fresh recount</Button>}
        {E.submit(state.attempt.kind === "unknown" ? "Retry unchanged count" : state.attempt.kind === "submitting" ? "Recording…" : "Record count", { id: `${formId}-submit`, submitting: state.attempt.kind === "submitting",
          reason: reason && next ? <button type="button" data-preview-action className="text-left underline underline-offset-2" onClick={() => { const field = document.getElementById(`${formId}-${next.row - 1}`); field?.scrollIntoView({ block: "center" }); field?.focus({ preventScroll: true }); }}>{reason}</button> : reason })}
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
          <p className="text-sm text-muted-foreground">{`${savedLineDetail(line, index + 1, { showBin: true, showLotCode: true })} · counted ${line.qty_counted} of ${line.qty_before} recorded`}</p>
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
