"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";

export function DeleteFormatControl({ name, busy = false, error, onDelete }: {
  name: string; busy?: boolean; error?: string | null; onDelete?: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  return <CommandForm open={open} onOpenChange={next => { if (!busy) setOpen(next); }} title="Delete format"
    trigger={<Button data-preview-action variant="destructive" size="sm">Delete format</Button>}>
    <form className="flex flex-col gap-4" onSubmit={async event => {
      event.preventDefault();
      event.stopPropagation();
      if (!busy && (!onDelete || await onDelete())) setOpen(false);
    }}>
      <p>Delete <strong>{name}</strong> and its contents and packaging-material assignments? This cannot be undone.</p>
      <p className="text-sm text-muted-foreground">The smaller formats and materials themselves stay. Formats used by a SKU, another package, pricing or history cannot be deleted.</p>
      <CommandFormMessage error={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" variant="destructive" disabled={busy}>{busy ? "Deleting…" : "Delete format"}</Button>
      </div>
    </form>
  </CommandForm>;
}
