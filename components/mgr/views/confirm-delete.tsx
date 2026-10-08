"use client";

// Shared confirm sheet: one trigger, two lines of copy, a Cancel/confirm
// footer. Every destructive or irreversible verb opens it first, so its command
// runs only from the confirm button (#760). Entity controls (customer, format,
// row deletes) and plan cancellation supply the copy; the footer labels default
// to a delete. `tone: "irreversible"` draws a one-time commit (filing a period)
// instead of a loss; `onDelete` is the confirmed action either way.
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { cn } from "@/lib/utils";

const IRREVERSIBLE = "bg-irreversible text-irreversible-foreground hover:bg-irreversible/90";

export function ConfirmDeleteControl({ title, triggerLabel, name, warning, busy = false, disabled = false, error, onDelete, size, tone = "destructive", dismissLabel = "Cancel", busyLabel = "Deleting…" }: {
  /** Sheet title, confirm label, and the trigger's accessible name, e.g. "Delete customer". */
  title: string;
  /** Shorter visible trigger text for a row verb ("Delete"); `title` then names the row for assistive tech. */
  triggerLabel?: string;
  /** What is being acted on; the first sentence, may hold `<strong>`. */
  name: ReactNode;
  /** Muted second line: what blocks or follows the action. */
  warning: string;
  busy?: boolean;
  /** Holds the trigger closed, e.g. while a report does not balance. */
  disabled?: boolean;
  error?: string | null;
  /** Resolves true when the action succeeded and the sheet may close. */
  onDelete?: () => Promise<boolean>;
  size?: "sm";
  tone?: "destructive" | "irreversible";
  /** Footer button that closes the sheet without acting. */
  dismissLabel?: string;
  /** Confirm button label while the action runs. */
  busyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const irreversible = tone === "irreversible";
  const variant = irreversible ? "default" : "destructive";
  const toneProps = irreversible ? { "data-variant": "irreversible" } : {};
  return <CommandForm open={open} onOpenChange={next => { if (!busy) setOpen(next); }} title={title}
    trigger={<Button data-preview-action variant={variant} size={size} disabled={busy || disabled} {...toneProps}
      aria-label={triggerLabel ? title : undefined} className={cn(irreversible && `w-full md:w-fit ${IRREVERSIBLE}`)}>{triggerLabel ?? title}</Button>}>
    <form data-preview-action className="flex flex-col gap-4" onSubmit={async event => {
      event.preventDefault();
      event.stopPropagation();
      if (!busy && (!onDelete || await onDelete())) setOpen(false);
    }}>
      <p>{name}</p>
      <p className="text-sm text-muted-foreground">{warning}</p>
      <CommandFormMessage error={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>{dismissLabel}</Button>
        <Button type="submit" variant={variant} disabled={busy} {...toneProps} className={cn(irreversible && IRREVERSIBLE)}>{busy ? busyLabel : title}</Button>
      </div>
    </form>
  </CommandForm>;
}
