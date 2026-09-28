// lib/commands/use-command-form.ts — the two client-side command lifecycles.
// useCommandAction is the primitive: run one command, hold busy/error (rendered
// by CommandFormMessage as role="alert"), refresh on success unless the
// caller opts out. useCommandForm
// adds the open/close and reset a mutation form needs (rendered in
// components/mgr/command-form.tsx), and hands back its `run` so a sheet's
// secondary verb (Remove, Delete, Clear) shares the one error slot that closing
// clears (#447). Forms own only their fields and how to build the command input.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBrewery, useCommandContext } from "@/app/(app)/brewery-provider";
import { beginRecovery, finishRecovery, inFlightRequests, readRecoveries, RECOVERY_CHANGED, recoveryKey, type RecoveryAttempt } from "./recovery";
import { classifyCommandFailure, command, type CommandFailureDetail } from "./client";

export function useCommandAction() {
  const breweryId = useBrewery();
  const expectedContext = useCommandContext();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailureDetail | null>(null);
  const [busy, setBusy] = useState(false);

  // Resolves true on success, so a caller that navigates away can wait for it.
  // `refresh: false` skips the post-success router.refresh() for a caller that
  // must keep its client state on screen (the Confirm order review, whose
  // server page redirects once the order is no longer submitted). `target`
  // names the row a per-row caller acts on, so an unresolved request blocks
  // only that row (see recoveryKey); leave it out everywhere else. A caller
  // passes `requestId` only to start a deliberate new exact attempt, and reads
  // the id actually sent (it may be a resumed saved attempt) from `onSent`.
  // `durable: false` skips the saved request for a read or a one-time secret.
  async function run(name: string, input: unknown, onSuccess?: (data: unknown) => void, requestId?: string,
    { refresh = true, target, durable = true, onSent }: { refresh?: boolean; target?: string; durable?: boolean; onSent?: (requestId: string) => void } = {}) {
    setBusy(true);
    setError(null);
    setFailure(null);
    let hadUnresolved = false;
    let attempt: RecoveryAttempt | undefined;
    try {
      if (durable) {
        const saved = readRecoveries(sessionStorage, expectedContext).find(row => recoveryKey(row.name, row.target) === recoveryKey(name, target));
        // Only this row's resumed attempt keeps a rejection from clearing it; a new explicit id replaces it.
        hadUnresolved = Boolean(saved) && (!requestId || saved?.requestId === requestId);
        attempt = beginRecovery(sessionStorage, expectedContext, location.pathname, name, input, { requestId, target });
      }
      const sent = attempt ?? { name, input, requestId: requestId ?? crypto.randomUUID(), expectedContext };
      onSent?.(sent.requestId);
      inFlightRequests.add(sent.requestId);
      let data: unknown;
      try { data = await command(sent.expectedContext.breweryId ?? breweryId, sent.name, sent.input, sent.requestId, sent.expectedContext); }
      finally { inFlightRequests.delete(sent.requestId); }
      if (attempt) finishRecovery(sessionStorage, attempt);
      onSuccess?.(data);
      if (refresh) router.refresh();
      return true;
    } catch (err) {
      const detail = classifyCommandFailure(err);
      if (!hadUnresolved && detail.kind === "definitive" && attempt) finishRecovery(sessionStorage, attempt);
      if (typeof window !== "undefined") window.dispatchEvent(new Event(RECOVERY_CHANGED));
      setFailure(detail);
      setError(detail.message === "command failed" ? `${name} failed` : detail.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, failure, setError, run };
}

/** One state object per sheet: initial values come from the row being edited (or blanks); reset restores them. */
export function useFields<T extends Record<string, string>>(initial: T) {
  const [v, setV] = useState(initial);
  const set = (k: keyof T) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  return { v, set, reset: () => setV(initial) };
}

/** An optional field is sent only when filled. */
export const orUndef = (s: string) => s || undefined;

/**
 * reset runs on open as well as on close: an edit sheet's fields are seeded
 * from props, and only the render after a save's router.refresh() has the
 * saved values, so reseeding on close alone reopened the pre-save values and a
 * second Save reverted the edit (#441). reset must therefore restore the same
 * values the fields' useState starts from. defaultOpen opens on mount without
 * a reset, for a sheet prefilled from outside (a chat handoff, a deep link).
 */
export function useCommandForm(name: string, opts: { build: () => unknown; reset: () => void; onSuccess?: (data: unknown) => void; defaultOpen?: boolean; target?: string }) {
  const { error, failure, setError, run: runAction } = useCommandAction();
  const [open, setOpenState] = useState(opts.defaultOpen ?? false);
  // The command in flight: `submitting` is the form's own verb, `busy` any.
  const [running, setRunning] = useState<string | null>(null);

  /** Runs a secondary verb (Remove, Delete, Clear) in this sheet's error slot; `target` as in useCommandAction. */
  async function run(command: string, input: unknown, onSuccess?: (data: unknown) => void, target?: string) {
    setRunning(command);
    try { return await runAction(command, input, onSuccess, undefined, { target }); } finally { setRunning(null); }
  }

  function setOpen(next: boolean) {
    setOpenState(next);
    opts.reset();
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // A sheet is a form in a dialog portal; React bubbles its submit through
    // the tree, so an enclosing page form must never see it.
    e.stopPropagation();
    await run(name, opts.build(), data => { opts.onSuccess?.(data); setOpen(false); }, opts.target);
  }

  return { open, setOpen, error, failure, submitting: running === name, busy: running !== null, submit, run };
}
