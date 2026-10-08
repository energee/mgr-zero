"use client";

// Shared confirm sheet: one trigger, two lines of copy, a Cancel/confirm
// footer. Destructive and irreversible verbs open it first, so their command
// runs only from the confirm button. Wrappers (customer, format, bin, …)
// supply the copy. `tone: "irreversible"` draws a one-time commit, not a loss.
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { IRREVERSIBLE, IrreversibleSubmit } from "@/components/mgr/irreversible-submit";

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
  /** Resolves true when the action succeeded and the sheet may close. A caller
   *  may share `error` with its own form; the sheet shows it only after its own
   *  attempt failed, never a stale Save error from the form underneath. */
  onDelete?: () => Promise<boolean>;
  size?: "sm";
  tone?: "destructive" | "irreversible";
  /** Footer button that closes the sheet without acting. */
  dismissLabel?: string;
  /** Confirm button label while the action runs. */
  busyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const toggle = (next: boolean) => { if (!busy) { setOpen(next); setFailed(false); } };
  const irreversible = tone === "irreversible";
  return <CommandForm open={open} onOpenChange={toggle} title={title}
    trigger={<Button data-preview-action variant={irreversible ? "default" : "destructive"} size={size} disabled={busy || disabled}
      aria-label={triggerLabel ? title : undefined} {...(irreversible ? { "data-variant": "irreversible", className: `w-full md:w-fit md:self-end ${IRREVERSIBLE}` } : {})}>{triggerLabel ?? title}</Button>}>
    <form data-preview-action className="flex flex-col gap-4" onSubmit={async event => {
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      if (!onDelete || await onDelete()) setOpen(false);
      else setFailed(true);
    }}>
      <p>{name}</p>
      <p className="text-sm text-muted-foreground">{warning}</p>
      <CommandFormMessage error={failed ? error : null} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => toggle(false)}>{dismissLabel}</Button>
        {irreversible
          ? <IrreversibleSubmit label={title} busy={busyLabel} submitting={busy} />
          : <Button type="submit" variant="destructive" disabled={busy}>{busy ? busyLabel : title}</Button>}
      </div>
    </form>
  </CommandForm>;
}
