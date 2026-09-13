"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

import { TapBoardView, type TapSku, type TapBoardNavigation } from "@/components/mgr/views/tap-board";
export type { TapSku } from "@/components/mgr/views/tap-board";

const when = (value: string) => new Date(value).toLocaleString();
const actor = (label: string | null) => label ? `@${label}` : "staff";

function closingFact(history: TapHistory[], interval: TapInterval | null) {
  const closed = interval && history.find((row) => row.id === interval.id);
  return closed ? `${tapLabel(closed)} was closed ${when(closed.closed_at)} by ${actor(closed.closed_by_label)}. Review the board before acting.` : null;
}

export function TapBoard({ breweryId, locationId, initial, skus, navigation }: { breweryId: string; locationId: string; initial: TapBoardSnapshot; skus: TapSku[]; navigation: TapBoardNavigation }) {
  const expectedContext = useRef(useCommandContext());
  const [state, setState] = useState<TapBoardState>({ snapshot: initial, sheet: null });
  const [pollError, setPollError] = useState<string | null>(null);
  const refreshGuard = useRef(createTapBoardRefreshGuard());

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
      const code = error instanceof CommandResponseError ? error.code : undefined;
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
      setState((current) => failTapBoardAttempt(snapshot ? replaceTapBoardSnapshot(current, snapshot) : current, status, message, retrying, code));
      return;
    }
    setState((current) => completeTapBoardAttempt(current, result.snapshot));
    setPollError((current) => pollErrorAfterTapBoardSave(current, result));
  }

  return <TapBoardView state={state} skus={skus} navigation={navigation} pollError={pollError}
    onOpen={open} onClose={() => setState(current => ({ ...current, sheet: null }))} onEdit={edit} onSubmit={submit} onReload={refresh} />;
}
