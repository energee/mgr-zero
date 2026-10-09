// app/(app)/locations/bin-form.tsx — CommandForm for create_bin (no id) and
// update_bin / delete_bin (with id, confirmed first). A location keeps at least one bin.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { BinView, RemoveBinControl } from "@/components/mgr/views/bin";
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
              <RemoveBinControl bin={bin.name} busy={form.busy} error={form.error}
                onDelete={() => form.run("delete_bin", { binId: bin.id }, () => form.setOpen(false), { target: bin.id })} />
            ) : null}
            <Button type="submit" disabled={form.busy || !name.trim()}>{form.submitting ? "Saving…" : bin ? "Save bin" : "Add bin"}</Button>
          </CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
