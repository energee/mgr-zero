"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { command, CommandResponseError } from "@/lib/commands/client";
import { useCommandContext } from "@/app/(app)/brewery-provider";
import {
  beginTapBoardAttempt,
  completeTapBoardAttempt,
  createTapBoardRefreshGuard,
  editTapBoardSheet,
  failTapBoardAttempt,
  openTapBoardSheet,
  pollErrorAfterTapBoardSave,
  replaceTapBoardSnapshot,
  setTapBoardError,
  submitAndRefreshTapBoard,
  tapBoardCommand,
  TAP_BOARD_POLL_MS,
  tapLabel,
  type TapBoardSnapshot,
  type TapBoardState,
  type TapHistory,
  type TapInterval,
  type TapSheetFields,
} from "@/lib/mgr/tap-board-state";

export type TapSku = { id: string; name: string; nominalBbl: number };

const fills = [
  [.25, "¼"], [.5, "½"], [.6, "60%"], [1, "Full"],
] as const;
const closingFills = [[0, "Empty"], [.25, "¼ left"], [.5, "½ left"]] as const;
const reasons = ["Kicked empty", "Flavor change", "Quality hold"];
const when = (value: string) => new Date(value).toLocaleString();
const volume = (value: number) => `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 })} bbl`;
const actor = (label: string | null) => label ? `@${label}` : "staff";

function FillButtons({ values, value, disabled, change }: { values: readonly (readonly [number, string])[]; value: number; disabled: boolean; change: (value: number) => void }) {
  return <div className="flex flex-wrap gap-2">{values.map(([fill, label]) =>
    <Button key={fill} type="button" variant={value === fill ? "default" : "outline"} aria-pressed={value === fill} disabled={disabled} onClick={() => change(fill)}>{label}</Button>)}</div>;
}

function closingFact(history: TapHistory[], interval: TapInterval | null) {
  const closed = interval && history.find((row) => row.id === interval.id);
  return closed ? `${tapLabel(closed)} was closed ${when(closed.closed_at)} by ${actor(closed.closed_by_label)}. Review the board before acting.` : null;
}

export function TapBoard({ breweryId, locationId, initial, skus }: { breweryId: string; locationId: string; initial: TapBoardSnapshot; skus: TapSku[] }) {
  const expectedContext = useRef(useCommandContext());
  const [state, setState] = useState<TapBoardState>({ snapshot: initial, sheet: null });
  const [pollError, setPollError] = useState<string | null>(null);
  const refreshGuard = useRef(createTapBoardRefreshGuard());
  const sheet = state.sheet;
  const locked = sheet?.attempt.kind === "submitting" || sheet?.attempt.kind === "unknown";

  const load = useCallback(async () => {
    const [open, history] = await Promise.all([
      command(breweryId, "list_open_taps", { locationId }) as Promise<TapInterval[]>,
      command(breweryId, "list_tap_history", { locationId }) as Promise<TapHistory[]>,
    ]);
    return { open, history };
  }, [breweryId, locationId]);
  const loadLatest = useCallback(() => refreshGuard.current.run(load), [load]);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await loadLatest();
      if (!snapshot) return;
      setState((current) => replaceTapBoardSnapshot(current, snapshot));
      setPollError(null);
    } catch { setPollError("Automatic refresh failed. Reload when the connection returns."); }
  }, [loadLatest]);

  useEffect(() => {
    const timer = window.setInterval(refresh, TAP_BOARD_POLL_MS);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);

  function open(kind: "tap" | "kick" | "swap", interval: TapInterval | null) {
    let next = openTapBoardSheet(state.snapshot, kind, interval, locationId);
    if (kind === "tap" && skus[0]) next = editTapBoardSheet(next, { skuId: skus[0].id });
    setState(next);
  }

  function edit(fields: Partial<TapSheetFields>) {
    setState((current) => editTapBoardSheet(current, fields));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const retrying = state.sheet?.attempt.kind === "unknown";
    let started: TapBoardState;
    try { started = beginTapBoardAttempt(state, crypto.randomUUID()); }
    catch (error) { setState((current) => setTapBoardError(current, error instanceof Error ? error.message : "Tap action failed")); return; }
    setState(started);
    const submitted = started.sheet;
    if (!submitted || submitted.attempt.kind !== "submitting") return;
    const attempt = submitted.attempt;
    const result = await submitAndRefreshTapBoard(
      () => command(breweryId, tapBoardCommand(submitted), attempt.payload, attempt.requestId, expectedContext.current),
      loadLatest,
    );
    if (result.kind === "write_failed") {
      const error = result.error;
      const status = error instanceof CommandResponseError ? error.status : null;
      let message = error instanceof Error ? error.message : "Tap action failed";
      let snapshot: TapBoardSnapshot | null = null;
      if (status === 409 && submitted.interval) {
        message = error instanceof CommandResponseError ? error.message : "This keg was already closed. Reload the board before acting.";
        try {
          snapshot = await loadLatest();
          if (snapshot) message = closingFact(snapshot.history, submitted.interval) ?? message;
        }
        catch { /* keep the safe conflict copy returned by the close command */ }
      }
      setState((current) => failTapBoardAttempt(snapshot ? replaceTapBoardSnapshot(current, snapshot) : current, status, message, retrying));
      return;
    }
    setState((current) => completeTapBoardAttempt(current, result.snapshot));
    setPollError((current) => pollErrorAfterTapBoardSave(current, result));
  }

  return <>
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">On tap</h2>
      <Button size="sm" onClick={() => open("tap", null)}>Tap keg</Button>
    </div>
    <CommandForm open={Boolean(sheet)} onOpenChange={(next) => { if (!next && !locked) setState((current) => ({ ...current, sheet: null })); }} title={sheet ? sheet.kind === "tap" ? "Tap keg" : sheet.kind === "kick" ? `Kick ${tapLabel(sheet.interval!)}` : `Swap ${tapLabel(sheet.interval!)}` : "Tap keg"}>
      {sheet && <form onSubmit={submit} className="flex flex-col gap-4">
        {sheet.interval && <div><p className="font-medium">Coming off · {tapLabel(sheet.interval)}</p><p className="text-sm text-muted-foreground">Tap {sheet.interval.tap_number ?? "unnumbered"} · opened {when(sheet.interval.opened_at)} by {actor(sheet.interval.opened_by_label)}</p></div>}
        {sheet.kind !== "tap" && <>
          <fieldset className="flex flex-col gap-2"><legend className="mb-2 text-sm font-medium">Remaining when closed</legend><FillButtons values={closingFills} value={sheet.fields.closeFill} disabled={locked} change={(value) => edit({ closeFill: value as 0 | .25 | .5 })} /></fieldset>
          <div className="flex flex-col gap-2"><Label htmlFor="tap-reason">Reason</Label><Select disabled={locked} value={sheet.fields.reason} onValueChange={(reason) => edit({ reason })}><SelectTrigger id="tap-reason"><SelectValue /></SelectTrigger><SelectContent>{reasons.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}</SelectContent></Select></div>
        </>}
        {sheet.kind !== "kick" && <>
          <fieldset className="flex flex-col gap-2"><legend className="mb-2 text-sm font-medium">Keg identity</legend><div className="flex flex-wrap gap-2">
            {sheet.kind === "swap" && <Button type="button" variant={sheet.fields.identity === "same" ? "default" : "outline"} aria-pressed={sheet.fields.identity === "same"} disabled={locked || !sheet.interval?.sku_id} onClick={() => edit({ identity: "same" })}>Same own SKU</Button>}
            <Button type="button" variant={sheet.fields.identity === "own" ? "default" : "outline"} aria-pressed={sheet.fields.identity === "own"} disabled={locked} onClick={() => edit({ identity: "own" })}>Own keg</Button>
            <Button type="button" variant={sheet.fields.identity === "guest" ? "default" : "outline"} aria-pressed={sheet.fields.identity === "guest"} disabled={locked} onClick={() => edit({ identity: "guest" })}>Guest keg</Button>
          </div></fieldset>
          {sheet.fields.identity === "own" && <div className="flex flex-col gap-2"><Label htmlFor="tap-sku">Packaged keg SKU</Label><Select disabled={locked} value={sheet.fields.skuId} onValueChange={(skuId) => edit({ skuId })}><SelectTrigger id="tap-sku"><SelectValue placeholder="Choose a keg" /></SelectTrigger><SelectContent>{skus.map((sku) => <SelectItem key={sku.id} value={sku.id}>{sku.name} · {volume(sku.nominalBbl)}</SelectItem>)}</SelectContent></Select></div>}
          {sheet.fields.identity === "guest" && <>
            <div className="flex flex-col gap-2"><Label htmlFor="tap-guest-label">Guest keg label</Label><Input id="tap-guest-label" maxLength={200} value={sheet.fields.guestLabel} disabled={locked} onChange={(event) => edit({ guestLabel: event.target.value })} required /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="tap-guest-volume">Nominal BBL</Label><Input id="tap-guest-volume" type="number" min="0" step="any" value={sheet.fields.guestNominalBbl} disabled={locked} onChange={(event) => edit({ guestNominalBbl: event.target.value })} required /></div>
          </>}
          <div className="flex flex-col gap-2"><Label htmlFor="tap-number">Tap number · optional and may repeat</Label><Input id="tap-number" maxLength={80} value={sheet.fields.tapNumber} disabled={locked} onChange={(event) => edit({ tapNumber: event.target.value })} /></div>
          <fieldset className="flex flex-col gap-2"><legend className="mb-2 text-sm font-medium">Opening fill</legend><FillButtons values={fills} value={sheet.fields.openingFill} disabled={locked} change={(value) => edit({ openingFill: value as .25 | .5 | .6 | 1 })} /></fieldset>
        </>}
        <p className="text-sm text-muted-foreground">Fill is a rough observation. This action never changes finished-goods inventory.</p>
        {sheet.attempt.kind === "unknown" && <CommandFormMessage tone="warning">No trustworthy response arrived. The request and fields are frozen; retry unchanged to recover the original result.</CommandFormMessage>}
        {sheet.attempt.kind === "error" && <CommandFormMessage error={sheet.attempt.message} />}
        <CommandFormFooter><Button type="submit" variant={sheet.kind === "kick" ? "destructive" : "default"} disabled={sheet.attempt.kind === "submitting"}>{sheet.attempt.kind === "unknown" ? "Retry unchanged" : sheet.attempt.kind === "submitting" ? "Saving…" : sheet.kind === "tap" ? "Tap keg" : sheet.kind === "kick" ? "Kick keg" : "Swap · one record"}</Button></CommandFormFooter>
      </form>}
    </CommandForm>
    <CommandFormMessage tone="warning">{pollError}</CommandFormMessage>
    {state.snapshot.open.length === 0 ? <p className="rounded-xl border p-4 text-sm">No kegs are on tap.</p> : <div className="grid gap-3 md:grid-cols-2">{state.snapshot.open.map((tap) => <article key={tap.id} className="rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">Tap {tap.tap_number ?? "unnumbered"} · {tapLabel(tap)}</h3><p className="text-sm text-muted-foreground">{tap.sku_id ? volume(tap.nominal_bbl) : `Guest keg · nominal ${volume(tap.nominal_bbl)}`} · opened {when(tap.opened_at)} by {actor(tap.opened_by_label)}</p></div></div>
      <p className="mt-2 text-sm">Opening fill {Math.round(Number(tap.opening_fill) * 100)}%{tap.not_in_inventory ? " · not in taproom stock · excluded from variance" : ""}</p>
      {!tap.sku_id && <p className="mt-1 text-xs text-muted-foreground">Guest yield is unavailable because this keg has no POS identity.</p>}
      <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => open("swap", tap)}>Swap</Button><Button size="sm" variant="destructive" onClick={() => open("kick", tap)}>Kick</Button></div>
    </article>)}</div>}
    <section aria-labelledby="tap-history-heading"><h2 id="tap-history-heading" className="text-lg font-semibold">Recent history</h2>
      {state.snapshot.history.length === 0 ? <p className="text-sm text-muted-foreground">No closed kegs yet.</p> : state.snapshot.history.map((tap) => <div key={tap.id} className="border-b py-3 text-sm"><p className="font-medium">Tap {tap.tap_number ?? "unnumbered"} · {tapLabel(tap)}</p><p className="text-muted-foreground">{tap.close_reason} · {Math.round(Number(tap.closing_fill) * 100)}% left · closed {when(tap.closed_at)} by {actor(tap.closed_by_label)}</p></div>)}
    </section>
  </>;
}
