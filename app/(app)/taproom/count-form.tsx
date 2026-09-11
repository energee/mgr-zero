"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { command, CommandResponseError } from "@/lib/commands/client";
import { useCommandContext } from "@/app/(app)/brewery-provider";
import {
  beginCorrectionAttempt,
  beginCountAttempt,
  countBrandComparison,
  countDraftFromSnapshot,
  countFailureKind,
  completeCorrectionAttempt,
  correctionStateFromReceipt,
  failCorrectionAttempt,
  failCountAttempt,
  projectionExpectedText,
  projectionMatchesCountDraft,
  replaceCountProjection,
  replaceCountSnapshot,
  updateCorrectionQuantity,
  updateCorrectionReason,
  updateCountQuantity,
  type TaproomCountSnapshot,
  type TaproomCorrectionLine,
} from "@/lib/mgr/taproom-count-state";

export type DraftProjection = {
  prior_count: { id: string; counted_on: string; created_at: string } | null;
  starts_at: string | null;
  ends_at: string;
  as_of: string;
  reason: string | null;
  expected_bbl: number | null;
  coverage_complete: boolean;
  coverage_sources: { external_location_id: string; complete: boolean; observed_starts_at: string | null; observed_ends_at: string | null }[];
  mapped_lines: number;
  unmapped_lines: number;
  ignored_lines: number;
  excluded_bbl: number;
  unattributed_bbl: number;
  rows: { brand_id: string; brand_name: string; expected_bbl: number; excluded_bbl: number; unattributed_bbl: number; split: boolean }[];
};

export type PrintLabel = {
  worksheet_row: number;
  bin_id: string;
  bin_name: string;
  sku_id: string;
  sku_name: string;
  brand_id: string;
  brand_name: string;
  package_volume_label: string;
  lot_id: string | null;
  lot_code: string | null;
  qty: number;
};

const countError = (error: unknown) => error instanceof Error ? error.message : "Count failed";
const bbl = (value: number | null) => value === null ? "—" : `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 })} bbl`;

export function TaproomPrintWorksheet({ breweryId, locationId, locationName, revision, initialLabels }: {
  breweryId: string;
  locationId: string;
  locationName: string;
  revision: string;
  initialLabels: PrintLabel[];
}) {
  const [labels, setLabels] = useState<PrintLabel[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function print() {
    setBusy(true); setError(null);
    try {
      const fresh = await command(breweryId, "get_taproom_print_labels", { locationId, revision }) as PrintLabel[];
      if (!active.current) return;
      flushSync(() => setLabels(fresh));
      const disarm = () => { if (active.current) flushSync(() => setLabels(null)); };
      window.addEventListener("afterprint", disarm, { once: true });
      try { window.print(); }
      finally {
        window.removeEventListener("afterprint", disarm);
        disarm();
      }
    } catch (cause) { if (active.current) setError(countError(cause)); }
    finally { if (active.current) setBusy(false); }
  }

  return <>
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      <Button type="button" variant="outline" disabled={busy} onClick={print}>{busy ? "Checking stock…" : "Print current stock labels"}</Button>
      {initialLabels.length === 0 && <span className="text-sm text-muted-foreground">No current positive stock to print.</span>}
      <CommandFormMessage error={error} />
    </div>
    <section aria-labelledby="print-labels-heading" className="hidden print:block">
      <h1 id="print-labels-heading" className="text-xl font-semibold">Taproom stock labels · {locationName}</h1>
      {labels === null ? <p>Use Print current stock labels on this page so MGR can check current stock before printing.</p> : <>
        <p className="mb-4 text-sm">Current positive stock · worksheet rows from the captured count</p>
        {labels.length === 0 ? <p>No current positive stock to print.</p> : <ol className="grid grid-cols-2 gap-3">
          {labels.map((label) => <li key={`${label.bin_id}:${label.sku_id}:${label.lot_id ?? "untracked"}`} value={label.worksheet_row} className="break-inside-avoid rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide">Worksheet row {label.worksheet_row}</p>
            <h2 className="text-lg font-semibold">{label.brand_name} · {label.sku_name}</h2>
            <p>{label.package_volume_label} · {label.bin_name} · {label.qty} on hand</p>
            <p className="font-medium">{label.lot_id ? `Lot ${label.lot_code}` : "Untracked"}</p>
          </li>)}
        </ol>}
      </>}
    </section>
  </>;
}

function Projection({ projection, comparison, priorCount, locationId, aligned, locked, recoveryPending, busy, error, refresh }: {
  projection: DraftProjection;
  comparison: ReturnType<typeof countBrandComparison>;
  priorCount: TaproomCountSnapshot["prior_count"];
  locationId: string;
  aligned: boolean;
  locked: boolean;
  recoveryPending: boolean;
  busy: boolean;
  error: string | null;
  refresh: () => void;
}) {
  const expected = projectionExpectedText(projection);
  return <section aria-labelledby="expected-heading" className="rounded-xl border bg-muted/20 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 id="expected-heading" className="font-semibold">Expected consumption</h2>
        <p className="text-sm text-muted-foreground">
          {priorCount ? <>Captured prior · <Link className="underline" href={`/taproom?location=${locationId}&count=${priorCount.id}`}>{priorCount.counted_on}</Link> · <span className="break-all">{priorCount.id}</span></> : "Captured prior · first count"}
        </p>
        {aligned && <p className="text-sm text-muted-foreground">{projection.starts_at ? `${new Date(projection.starts_at).toLocaleString()} through ${new Date(projection.as_of).toLocaleString()}` : "Expected comparison starts after the first saved count"}</p>}
      </div>
      <Button type="button" size="sm" variant="outline" disabled={busy || locked || !aligned} onClick={refresh}>{busy ? "Refreshing…" : "Refresh expected"}</Button>
    </div>
    {!aligned ? <p className="mt-3 text-sm text-warning-foreground">Expected comparison unavailable because a newer saved count changed its baseline. {recoveryPending ? "Recover the frozen submission before starting a fresh recount." : "Start a fresh recount."}</p>
      : expected ? <p className="mt-3 text-2xl font-semibold">{expected}</p> : <p className="mt-3 text-sm">Expected consumption unavailable · {(projection.reason ?? "no usable POS observation").replaceAll("_", " ")}</p>}
    {comparison.length > 0 && <div aria-label="Draft brand comparison" className="mt-4 grid gap-2">
      {comparison.map((row) => <div key={row.brandId} className="rounded-lg border bg-background/60 p-3">
        <p className="font-medium">{row.brandName}</p>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
          <div><dt className="text-xs text-muted-foreground">Expected</dt><dd>{bbl(row.expectedBbl)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Draft actual</dt><dd>{row.complete ? bbl(row.actualBbl) : "Enter all buckets"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Difference</dt><dd>{bbl(row.differenceBbl)}</dd></div>
        </dl>
      </div>)}
      <p className="text-xs text-muted-foreground">Draft actual is an estimate from this snapshot&apos;s package volumes. Expected minus actual is a comparison only; the saved receipt is authoritative.</p>
    </div>}
    {aligned && (projection.unmapped_lines > 0 || projection.ignored_lines > 0 || Number(projection.excluded_bbl) > 0 || Number(projection.unattributed_bbl) > 0) &&
      <p className="mt-3 text-xs text-muted-foreground">Coverage {projection.coverage_complete ? "complete" : "incomplete"} · {projection.unmapped_lines} unmapped · {projection.ignored_lines} ignored · {Number(projection.excluded_bbl)} bbl excluded · {Number(projection.unattributed_bbl)} bbl unattributed</p>}
    <CommandFormMessage error={error} />
  </section>;
}

export function TaproomCountForm({ breweryId, snapshot, projection, lotLabels, role }: {
  breweryId: string;
  snapshot: TaproomCountSnapshot;
  projection: DraftProjection;
  lotLabels: Record<string, string>;
  role: "admin" | "warehouse" | "taproom";
}) {
  const expectedContext = useRef(useCommandContext());
  const router = useRouter();
  const [state, setState] = useState(() => countDraftFromSnapshot(snapshot, projection));
  const [projectionBusy, setProjectionBusy] = useState(false);
  const [projectionError, setProjectionError] = useState<string | null>(null);
  const locked = state.attempt.kind === "unknown" || state.attempt.kind === "submitting" || state.attempt.kind === "stale";
  const comparison = countBrandComparison(state);
  const projectionAligned = projectionMatchesCountDraft(state);

  async function refreshProjection() {
    setProjectionBusy(true); setProjectionError(null);
    try {
      const next = await command(breweryId, "get_taproom_draft_projection", { locationId: state.draft.locationId }) as DraftProjection;
      setState((current) => replaceCountProjection(current, next));
    } catch (error) { setProjectionError(countError(error)); }
    finally { setProjectionBusy(false); }
  }

  async function refreshSnapshot() {
    try {
      const next = await command(breweryId, "get_taproom_count_snapshot", { locationId: state.draft.locationId }) as TaproomCountSnapshot;
      setState((current) => replaceCountSnapshot(current, next));
      router.refresh();
    } catch (error) { setState((current) => failCountAttempt(current, "error", countError(error))); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const retrying = state.attempt.kind === "unknown";
    let started;
    try { started = beginCountAttempt(state, crypto.randomUUID()); }
    catch (error) { setState(failCountAttempt(state, "error", countError(error))); return; }
    setState(started);
    if (started.attempt.kind !== "submitting") return;
    try {
      const saved = await command(breweryId, "record_taproom_count", started.attempt.payload, started.attempt.requestId, expectedContext.current) as { id: string };
      router.push(`/taproom?location=${state.draft.locationId}&count=${saved.id}`);
      router.refresh();
    } catch (error) {
      const message = countError(error);
      const response = error instanceof CommandResponseError ? error : null;
      setState((current) => failCountAttempt(current, countFailureKind(response?.status ?? null, message, retrying, response?.code), message));
    }
  }

  return <>
    <Projection projection={state.projection as DraftProjection} comparison={comparison} priorCount={state.draft.priorCount} locationId={state.draft.locationId} aligned={projectionAligned} locked={locked} recoveryPending={state.attempt.kind === "unknown" || state.attempt.kind === "submitting"} busy={projectionBusy} error={projectionError} refresh={refreshProjection} />
    <form onSubmit={submit} className="flex flex-col gap-4" aria-labelledby="count-heading">
      <div>
        <h2 id="count-heading" className="text-lg font-semibold">Count every stock bucket</h2>
        <p className="text-sm text-muted-foreground">Server date {state.draft.countedOn} · enter remaining whole packages, including zero. A partly full keg is one.</p>
      </div>
      {state.draft.lines.some((line) => line.lotId !== null) && role === "taproom" && <p className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">Tracked lots use the full worksheet row numbers shown here. Use Print current stock labels before counting; do not guess a lot.</p>}
      {state.draft.lines.length === 0 && <p className="rounded-lg border p-3 text-sm">No stock buckets are recorded at this taproom. Saving records an empty observation.</p>}
      {state.draft.lines.map((line, index) => {
        const worksheet = index + 1;
        const lot = line.lotId ? (role === "taproom" ? `Tracked worksheet row ${worksheet}` : `Lot ${lotLabels[line.key] ?? "label unavailable"} · worksheet row ${worksheet}`) : `Untracked stock · worksheet row ${worksheet}`;
        return <div key={line.key} className="grid gap-2 rounded-xl border p-3 md:grid-cols-[1fr_8rem] md:items-end">
          <div><p className="font-medium">{line.skuName}</p><p className="text-sm text-muted-foreground">{line.binName} · {lot} · recorded {line.qtyBefore}</p></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`count-${index}`}>Remaining units</Label><Input id={`count-${index}`} inputMode="numeric" type="number" min="0" max={line.qtyBefore} step="1" value={line.quantity} disabled={locked} aria-invalid={state.attempt.kind === "error" ? true : undefined} onChange={(event) => setState((current) => updateCountQuantity(current, line.key, event.target.value))} required /></div>
        </div>;
      })}
      {state.attempt.kind === "unknown" && <CommandFormMessage tone="warning">No trustworthy response arrived. The request ID and every quantity are frozen. Retry this unchanged count to recover its original result.</CommandFormMessage>}
      {state.attempt.kind === "stale" && <CommandFormMessage error={state.attempt.message}>This count is out of date. Start a fresh recount; entered quantities will be cleared.</CommandFormMessage>}
      {state.attempt.kind === "error" && <CommandFormMessage error={state.attempt.message} />}
      <div className="flex flex-col gap-2 md:flex-row md:justify-end">
        {state.attempt.kind === "stale" && <Button type="button" variant="outline" onClick={refreshSnapshot}>Start fresh recount</Button>}
        <Button type="submit" disabled={state.attempt.kind === "submitting" || state.attempt.kind === "stale"}>{state.attempt.kind === "unknown" ? "Retry unchanged count" : state.attempt.kind === "submitting" ? "Recording…" : "Record count"}</Button>
      </div>
    </form>
  </>;
}

export function TaproomCountCorrection({ breweryId, locationId, countId, lines }: {
  breweryId: string;
  locationId: string;
  countId: string;
  lines: TaproomCorrectionLine[];
}) {
  const expectedContext = useRef(useCommandContext());
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(() => correctionStateFromReceipt(countId, lines));
  const locked = state.attempt.kind === "submitting" || state.attempt.kind === "unknown" || state.attempt.kind === "saved";
  const formId = `correct-count-${countId}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const retrying = state.attempt.kind === "unknown";
    let started;
    try { started = beginCorrectionAttempt(state, crypto.randomUUID()); }
    catch (error) { setState((current) => failCorrectionAttempt(current, "error", countError(error))); return; }
    setState(started);
    if (started.attempt.kind !== "submitting") return;
    try {
      await command(breweryId, "correct_taproom_count", started.attempt.payload, started.attempt.requestId, expectedContext.current);
    } catch (error) {
      const message = countError(error);
      const response = error instanceof CommandResponseError ? error : null;
      const failure = countFailureKind(response?.status ?? null, message, retrying, response?.code);
      setState((current) => failCorrectionAttempt(current, failure === "unknown" ? "unknown" : "error", message));
      return;
    }
    setState((current) => completeCorrectionAttempt(current));
    setOpen(false);
    router.push(`/taproom?location=${locationId}&count=${countId}`);
    router.refresh();
  }

  return <CommandForm
    open={open}
    onOpenChange={(next) => { if (next || !locked) setOpen(next); }}
    trigger={<Button type="button" variant="outline" disabled={state.attempt.kind === "saved"}>{state.attempt.kind === "saved" ? "Correction saved" : "Correct count"}</Button>}
    title="Correct saved count"
    footer={<CommandFormFooter>
      <Button type="submit" form={formId} disabled={state.attempt.kind === "submitting" || state.attempt.kind === "saved"}>
        {state.attempt.kind === "unknown" ? "Retry unchanged correction" : state.attempt.kind === "submitting" ? "Correcting…" : state.attempt.kind === "saved" ? "Correction saved" : "Save correction"}
      </Button>
    </CommandFormFooter>}
  >
    <form id={formId} onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Increase only the quantities that were counted too low. Recorded stock and the original count stay unchanged in the audit trail.</p>
      {state.lines.map((line, index) => <div key={line.id} className="grid gap-2 rounded-xl border p-3 md:grid-cols-[1fr_8rem] md:items-end">
        <div>
          <p className="font-medium">{line.sku_name ?? "Saved SKU"}</p>
          <p className="text-sm text-muted-foreground">{line.bin_name ?? "Saved bin"} · saved row {index + 1} · {line.lot_id ? `tracked lot ${line.lot_id}` : "untracked stock"} · counted {line.qty_counted} · recorded before {line.qty_before}</p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`correction-${countId}-${index}`}>Corrected units</Label>
          <Input id={`correction-${countId}-${index}`} inputMode="numeric" type="number" min={line.qty_counted} max={line.qty_before} step="1" value={line.quantity} disabled={locked || line.qty_counted === line.qty_before} onChange={(event) => setState((current) => updateCorrectionQuantity(current, line.id, event.target.value))} />
        </div>
      </div>)}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`correction-reason-${countId}`}>Reason</Label>
        <Textarea id={`correction-reason-${countId}`} value={state.reason} disabled={locked} onChange={(event) => setState((current) => updateCorrectionReason(current, event.target.value))} required />
      </div>
      {state.attempt.kind === "unknown" && <CommandFormMessage tone="warning">No trustworthy response arrived. The request ID, reason, and corrected quantities are frozen. Retry unchanged to recover the original result.</CommandFormMessage>}
      {state.attempt.kind === "error" && <CommandFormMessage error={state.attempt.message} />}
    </form>
  </CommandForm>;
}
