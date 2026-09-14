"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";

export function DeleteCustomerControl({ name, busy = false, error, onDelete }: {
  name: string;
  busy?: boolean;
  error?: string | null;
  onDelete?: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  return <CommandForm open={open} onOpenChange={next => { if (!busy) setOpen(next); }}
    title="Delete customer"
    trigger={<Button data-preview-action variant="destructive" size="sm">Delete customer</Button>}>
    <form data-preview-action onSubmit={async event => {
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      if (!onDelete || await onDelete()) setOpen(false);
    }} className="space-y-4 py-2">
      <p>Delete <strong>{name}</strong> and its ship-to addresses? This cannot be undone.</p>
      <p className="text-sm text-muted-foreground">Customers with orders, invoices, keg records, portal access, invitations or a QuickBooks link cannot be deleted.</p>
      <CommandFormMessage error={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" variant="destructive" disabled={busy}>{busy ? "Deleting…" : "Delete customer"}</Button>
      </div>
    </form>
  </CommandForm>;
}
