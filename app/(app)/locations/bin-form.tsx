// app/(app)/locations/bin-form.tsx — CommandForm for create_bin (no id) and
// update_bin / delete_bin (with id; Remove is BinView's own section, confirmed
// first). A location keeps at least one bin.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { BinView, RemoveBinControl } from "@/components/mgr/views/bin";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { toBinViewProps } from "@/lib/mgr/bin-view";

export function BinForm({ locationId, bins, bin }: { locationId: string; bins: readonly { id: string; name: string }[]; bin?: { id: string; name: string } }) {
  const [name, setName] = useState(bin?.name ?? "");
  const form = useCommandForm(bin ? "update_bin" : "create_bin", {
    build: () => {
      if (!bin) return { locationId, name: name.trim() };
      return { binId: bin.id, name: name === bin.name ? name : name.trim() };
    },
    reset: () => setName(bin?.name ?? ""),
    target: bin?.id,
  });
  const model = toBinViewProps({ name, bins, binId: bin?.id, tapBoardHref: "/taproom/board" });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={bin ? `Edit bin · ${bin.name}` : "Add bin"}
      trigger={<Button size="sm" variant={bin ? "outline" : "default"} aria-label={bin ? `Edit ${bin.name}` : undefined}>{bin ? "Edit" : "Add bin"}</Button>}>
      <form onSubmit={(event) => {
        if (model.nameError || !name.trim()) { event.preventDefault(); event.stopPropagation(); return; }
        void form.submit(event);
      }} className="flex flex-col gap-4">
        <BinView
          model={model}
          controls={{ name: setName }}
          messages={<CommandFormMessage error={form.error} />}
          footer={<CommandFormFooter>
            <Button type="submit" disabled={form.busy || !name.trim() || Boolean(model.nameError)}>{form.submitting ? "Saving…" : bin ? "Save bin" : "Add bin"}</Button>
          </CommandFormFooter>}
          remove={bin ? <RemoveBinControl bin={bin.name} busy={form.busy} error={form.error}
            onDelete={() => form.run("delete_bin", { binId: bin.id }, () => form.setOpen(false), { target: bin.id })} /> : null}
        />
      </form>
    </CommandForm>
  );
}
