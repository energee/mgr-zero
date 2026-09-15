// app/(app)/pricing/group-form.tsx — a price group: one row of the price grid.
// CommandForm over upsert_price_group, doubling as create (no `groupId`) and
// edit (`groupId` rides in the input). Both draw the same PriceGroupView from
// the same adapter, so the dialog reads the same whether the row exists yet. Delete calls
// delete_price_group and shows its refusal ("price group is in use") inline,
// the way delete-channel-button.tsx does.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { PriceGroupView, type PriceGroupViewModel } from "@/components/mgr/views/price-group";
import { useCommandAction, useCommandForm } from "@/lib/commands/use-command-form";

export function GroupForm({ groupId, model }: { groupId?: string; model: PriceGroupViewModel }) {
  const [draft, setDraft] = useState(model);
  const edit = (key: "name" | "position" | "costCeilingInput") => (value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const remove = useCommandAction();
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
          model={draft}
          controls={{ name: edit("name"), position: edit("position"), costCeiling: edit("costCeilingInput") }}
          back={null}
          messages={<><CommandFormMessage error={form.error} /><CommandFormMessage error={remove.error} /></>}
          footer={<CommandFormFooter>
            {groupId && (
              <Button type="button" variant="ghost" disabled={remove.busy} onClick={() => remove.run("delete_price_group", { priceGroupId: groupId })}>Delete</Button>
            )}
            <Button type="submit" disabled={form.submitting}>{form.submitting ? "Saving…" : "Save price group"}</Button>
          </CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
