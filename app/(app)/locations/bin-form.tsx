// app/(app)/locations/bin-form.tsx — CommandForm for create_bin (no id) and
// update_bin / delete_bin (with id). A location keeps at least one bin.
// Remove confirms in the shared sheet first (#760) and shows its refusal there.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { BinView } from "@/components/mgr/views/bin";
import { ConfirmDeleteControl } from "@/components/mgr/views/confirm-delete";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { toBinViewProps } from "@/lib/mgr/bin-view";

export function BinForm({ locationId, bin }: { locationId: string; bin?: { id: string; name: string } }) {
  const [name, setName] = useState(bin?.name ?? "");
  const form = useCommandForm(bin ? "update_bin" : "create_bin", {
    build: () => (bin ? { binId: bin.id, name } : { locationId, name }),
    reset: () => setName(bin?.name ?? ""),
    target: bin?.id,
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Bin"
      trigger={<Button size="sm" variant={bin ? "outline" : "default"} aria-label={bin ? `Edit ${bin.name}` : undefined}>{bin ? "Edit" : "Add bin"}</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <BinView
          model={toBinViewProps({ id: bin?.id, name })}
          controls={{ name: setName }}
          messages={<CommandFormMessage error={form.error} />}
          footer={<CommandFormFooter>
            {bin ? (
              <ConfirmDeleteControl title={`Remove ${bin.name}`} triggerLabel="Remove" busy={form.busy} error={form.error} busyLabel="Removing…"
                name={<>Remove the <strong>{bin.name}</strong> bin?</>}
                warning="A location keeps at least one bin. A bin with recorded stock, or one a POS menu uses, cannot be removed."
                onDelete={() => form.run("delete_bin", { binId: bin.id }, () => form.setOpen(false), { target: bin.id })} />
            ) : null}
            <Button type="submit" disabled={form.busy || !name.trim()}>{form.submitting ? "Saving…" : bin ? "Save bin" : "Add bin"}</Button>
          </CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
