// lib/commands/use-command-form.ts — the two client-side command lifecycles.
// useCommandAction is the primitive: run one command, hold busy/error (rendered
// by CommandFormMessage as role="alert"), refresh on success. useCommandForm
// adds the open/close and reset a mutation form needs (rendered in
// components/mgr/command-form.tsx). Forms own only their fields and how to
// build the command input.
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBrewery, useCommandContext } from "@/app/(app)/brewery-provider";
import { classifyCommandFailure, command, type CommandFailureDetail } from "./client";

export function useCommandAction() {
  const breweryId = useBrewery();
  const expectedContext = useCommandContext();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailureDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const pending = useRef<{ key: string; requestId: string; expectedContext: typeof expectedContext } | null>(null);

  // Resolves true on success, so a caller that navigates away can wait for it.
  async function run(name: string, input: unknown, onSuccess?: (data: unknown) => void, requestId?: string) {
    setBusy(true);
    setError(null);
    setFailure(null);
    try {
      const key = JSON.stringify([name, input]);
      if (pending.current?.key !== key) pending.current = { key, requestId: crypto.randomUUID(), expectedContext };
      const attempt = pending.current;
      const data = await command(attempt.expectedContext.breweryId ?? breweryId, name, input, requestId ?? attempt.requestId, attempt.expectedContext);
      pending.current = null;
      onSuccess?.(data);
      router.refresh();
      return true;
    } catch (err) {
      const detail = classifyCommandFailure(err);
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

export function useCommandForm(name: string, opts: { build: () => unknown; reset: () => void; onSuccess?: (data: unknown) => void }) {
  const { busy, error, setError, run } = useCommandAction();
  const [open, setOpenState] = useState(false);

  function setOpen(next: boolean) {
    setOpenState(next);
    if (!next) { opts.reset(); setError(null); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // A sheet is a form in a dialog portal; React bubbles its submit through
    // the tree, so an enclosing page form must never see it.
    e.stopPropagation();
    await run(name, opts.build(), data => { opts.onSuccess?.(data); setOpen(false); });
  }

  return { open, setOpen, error, submitting: busy, submit };
}
