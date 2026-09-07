// lib/commands/use-command-form.ts — the two client-side command lifecycles.
// useCommandAction is the primitive: run one command, hold busy/error (rendered
// by CommandFormMessage as role="alert"), refresh on success. useCommandForm
// adds the open/close and reset a mutation form needs (rendered in
// components/mgr/command-form.tsx). Forms own only their fields and how to
// build the command input.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBrewery } from "@/app/(app)/brewery-provider";
import { command } from "./client";

export function useCommandAction() {
  const breweryId = useBrewery();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Resolves true on success, so a caller that navigates away can wait for it.
  async function run(name: string, input: unknown, onSuccess?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await command(breweryId, name, input);
      onSuccess?.();
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

export function useCommandForm(name: string, opts: { build: () => unknown; reset: () => void }) {
  const { busy, error, setError, run } = useCommandAction();
  const [open, setOpenState] = useState(false);

  function setOpen(next: boolean) {
    setOpenState(next);
    if (!next) { opts.reset(); setError(null); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run(name, opts.build(), () => setOpen(false));
  }

  return { open, setOpen, error, submitting: busy, submit };
}
