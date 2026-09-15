"use client";

// Shared confirm-delete sheet: one destructive trigger, two lines of copy, a
// Cancel/Delete footer. Entity controls (customer, format) supply the copy.
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";

export function ConfirmDeleteControl({ title, name, warning, busy = false, error, onDelete, size }: {
  /** Sheet title and trigger label, e.g. "Delete customer". */
  title: string;
  /** What is being deleted; the first sentence, may hold `<strong>`. */
  name: ReactNode;
  /** Muted second line: what blocks the delete. */
  warning: string;
  busy?: boolean;
  error?: string | null;
  /** Resolves true when the delete succeeded and the sheet may close. */
  onDelete?: () => Promise<boolean>;
  size?: "sm";
}) {
  const [open, setOpen] = useState(false);
  return <CommandForm open={open} onOpenChange={next => { if (!busy) setOpen(next); }} title={title}
    trigger={<Button data-preview-action variant="destructive" size={size}>{title}</Button>}>
    <form data-preview-action className="flex flex-col gap-4" onSubmit={async event => {
      event.preventDefault();
      event.stopPropagation();
      if (!busy && (!onDelete || await onDelete())) setOpen(false);
    }}>
      <p>{name}</p>
      <p className="text-sm text-muted-foreground">{warning}</p>
      <CommandFormMessage error={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" variant="destructive" disabled={busy}>{busy ? "Deleting…" : title}</Button>
      </div>
    </form>
  </CommandForm>;
}
