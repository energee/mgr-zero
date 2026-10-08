// app/(app)/pricing/group-form.tsx — a price group: one row of the price grid.
// CommandForm over upsert_price_group, doubling as create (no `groupId`) and
// edit (`groupId` rides in the input). Both draw the same PriceGroupView from
// the same adapter, so the dialog reads the same whether the row exists yet. Delete calls
// delete_price_group and shows its refusal ("price group is in use") inline,
// the way delete-channel-button.tsx does. An existing group also adds pours
// (PourForm) and removes them (delete_format) in the same error slot. Both
// removals confirm in the shared sheet first (#760).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { ConfirmDeleteControl } from "@/components/mgr/views/confirm-delete";
import { PriceGroupView, type PriceGroupViewModel } from "@/components/mgr/views/price-group";
import { PourForm } from "@/app/(app)/catalog/pour-form";
import { useCommandForm } from "@/lib/commands/use-command-form";

export function GroupForm({ groupId, model }: { groupId?: string; model: PriceGroupViewModel }) {
  const [draft, setDraft] = useState(model);
  const edit = (key: "name" | "position" | "costCeilingInput") => (value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const form = useCommandForm("upsert_price_group", {
    build: () => ({
      ...(groupId ? { id: groupId } : {}),
      name: draft.name,
      position: Number(draft.position),
      costCeilingCents: draft.costCeilingInput === "" ? undefined : Math.round(Number(draft.costCeilingInput) * 100),
    }),
    reset: () => setDraft(model),
  });

  return (
    <CommandForm
      open={form.open}
      onOpenChange={form.setOpen}
      title={groupId ? "Edit price group" : "New price group"}
      trigger={groupId
        ? <Button variant="link" size="sm" className="px-0 font-medium">{model.name}</Button>
        : <Button>Create price group</Button>}
    >
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <PriceGroupView
          // Only the three fields are drafts; pours come from the refreshed model, so
          // Add pour and Remove show up without reopening the dialog.
          model={{ ...model, name: draft.name, position: draft.position, costCeilingInput: draft.costCeilingInput }}
          controls={{ name: edit("name"), position: edit("position"), costCeiling: edit("costCeilingInput") }}
          back={null}
          addPour={groupId ? <PourForm priceGroupId={groupId} groupName={model.name} /> : undefined}
          renderPour={(pour) => <ConfirmDeleteControl title={`Remove ${pour.name}`} triggerLabel="Remove" size="sm" busy={form.busy} error={form.error} busyLabel="Removing…"
            name={<>Remove the <strong>{pour.name}</strong> pour from {model.name}?</>}
            warning="Refused while its price cells are filled, or while a Square mapping, menu line or recorded sale uses it."
            onDelete={() => form.run("delete_format", { formatId: pour.id }, undefined, { target: pour.id })} />}
          messages={<CommandFormMessage error={form.error} />}
          footer={<CommandFormFooter>
            {groupId && (
              <ConfirmDeleteControl title={`Delete ${model.name}`} triggerLabel="Delete" busy={form.busy} error={form.error}
                name={<>Delete the <strong>{model.name}</strong> price group? This cannot be undone.</>}
                warning="A group a brand sits on, a pour belongs to, or a cell is filled for cannot be deleted."
                onDelete={() => form.run("delete_price_group", { priceGroupId: groupId }, undefined, { target: groupId })} />
            )}
            <Button type="submit" disabled={form.busy}>{form.submitting ? "Saving…" : "Save price group"}</Button>
          </CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
