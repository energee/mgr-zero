// lib/commands/use-command-form.ts — the dialog-form lifecycle every mutation
// dialog shares: open/close, one command action (with its serialized request
// ID), inline error, and refresh on success. Forms own only their fields and
// how to build the command input.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBrewery } from "@/app/(app)/brewery-provider";
import { command } from "./client";

export function useCommandForm(name: string, opts: { build: () => unknown; reset: () => void }) {
  const breweryId = useBrewery();
  const router = useRouter();
  const [open, setOpenState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setOpen(next: boolean) {
    setOpenState(next);
    if (!next) { opts.reset(); setError(null); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await command(breweryId, name, opts.build());
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${name} failed`);
    } finally {
      setSubmitting(false);
    }
  }

  return { open, setOpen, error, submitting, submit };
}
