// app/(app)/locations/bin-form.tsx — CommandForm for create_bin (no id) and
// update_bin / delete_bin (with id). A location keeps at least one bin.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandAction, useCommandForm } from "@/lib/commands/use-command-form";

export function BinForm({ locationId, bin }: { locationId: string; bin?: { id: string; name: string } }) {
  const [name, setName] = useState(bin?.name ?? "");
  const form = useCommandForm(bin ? "update_bin" : "create_bin", {
    build: () => (bin ? { binId: bin.id, name } : { locationId, name }),
    reset: () => setName(bin?.name ?? ""),
  });
  const del = useCommandAction();
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={bin ? "Edit bin" : "Add bin"}
      trigger={<Button size="sm" variant={bin ? "outline" : "default"}>{bin ? "Edit" : "Add bin"}</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="bin-name">Bin name</Label>
          <Input id="bin-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <p className="text-sm text-muted-foreground">A location keeps at least one bin. Rename the last one rather than removing it.</p>
        <CommandFormMessage error={form.error ?? del.error} />
        <CommandFormFooter>
          {bin ? (
            <Button type="button" variant="destructive" disabled={del.busy} onClick={() => del.run("delete_bin", { binId: bin.id }, () => form.setOpen(false))}>
              Remove
            </Button>
          ) : null}
          <Button type="submit" disabled={form.submitting || !name.trim()}>{form.submitting ? "Saving…" : bin ? "Save bin" : "Add bin"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
