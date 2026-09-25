"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { ReactNode } from "react";
import { WeeklyCountDraftView, WeeklyCountPrintAction, WeeklyCountCorrectionView } from "@/components/mgr/views/weekly-count";
import { useRouter } from "next/navigation";
import { command, CommandResponseError } from "@/lib/commands/client";
import { useCommandContext } from "@/app/(app)/brewery-provider";
import {
  beginCorrectionAttempt,
  beginCountAttempt,
  countDraftFromSnapshot,
  countFailureKind,
  completeCorrectionAttempt,
  correctionStateFromReceipt,
  failCorrectionAttempt,
  failCountAttempt,
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
    <WeeklyCountPrintAction busy={busy} empty={initialLabels.length === 0} error={error} onPrint={print} />
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

export function TaproomCountForm({ breweryId, snapshot, projection, lotLabels, role, timeZone, print }: {
  breweryId: string;
  /** breweries.timezone, from the server page: SSR and hydration format the same times (#442). */
  timeZone: string;
  snapshot: TaproomCountSnapshot;
  projection: DraftProjection;
  lotLabels: Record<string, string>;
  role: "admin" | "warehouse" | "taproom";
  print?: ReactNode;
}) {
  const expectedContext = useRef(useCommandContext());
  const router = useRouter();
  const [state, setState] = useState(() => countDraftFromSnapshot(snapshot, projection));
  const [projectionBusy, setProjectionBusy] = useState(false);
  const [projectionError, setProjectionError] = useState<string | null>(null);

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

  return <WeeklyCountDraftView state={state} role={role} lotLabels={lotLabels} timeZone={timeZone} print={print}
    priorHref={state.draft.priorCount ? `/taproom?location=${state.draft.locationId}&count=${state.draft.priorCount.id}` : undefined}
    projectionBusy={projectionBusy} projectionError={projectionError} onRefreshExpected={refreshProjection} onRefreshSnapshot={refreshSnapshot}
    onQuantity={(key, value) => setState(current => updateCountQuantity(current, key, value))} onSubmit={submit} />;
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

  return <WeeklyCountCorrectionView state={state} open={open} onOpenChange={setOpen} onSubmit={submit}
    onQuantity={(id, quantity) => setState(current => updateCorrectionQuantity(current, id, quantity))}
    onReason={reason => setState(current => updateCorrectionReason(current, reason))} />;
}
