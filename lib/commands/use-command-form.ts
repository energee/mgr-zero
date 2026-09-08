// lib/commands/use-command-form.ts — the two client-side command lifecycles.
// useCommandAction is the primitive: run one command, hold busy/error (rendered
// by CommandFormMessage as role="alert"), refresh on success. useCommandForm
// adds the open/close and reset a mutation form needs (rendered in
// components/mgr/command-form.tsx). Forms own only their fields and how to
// build the command input.
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBrewery } from "@/app/(app)/brewery-provider";
import { command } from "./client";

export function useCommandAction() {
  const breweryId = useBrewery();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pending = useRef<{ key: string; requestId: string } | null>(null);

  // Resolves true on success, so a caller that navigates away can wait for it.
  async function run(name: string, input: unknown, onSuccess?: (data: unknown) => void, requestId?: string) {
    setBusy(true);
    setError(null);
    try {
      const key = JSON.stringify([breweryId, name, input]);
      if (pending.current?.key !== key) pending.current = { key, requestId: crypto.randomUUID() };
      const data = await command(breweryId, name, input, requestId ?? pending.current.requestId);
      pending.current = null;
      onSuccess?.(data);
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : `${name} failed`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, setError, run };
}

export function useCommandForm(name: string, opts: { build: () => unknown; reset: () => void; onSuccess?: (data: unknown) => void }) {
  const { busy, error, setError, run } = useCommandAction();
  const [open, setOpenState] = useState(false);

  function setOpen(next: boolean) {
    setOpenState(next);
    if (!next) { opts.reset(); setError(null); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run(name, opts.build(), data => { opts.onSuccess?.(data); setOpen(false); });
  }

  return { open, setOpen, error, submitting: busy, submit };
}
