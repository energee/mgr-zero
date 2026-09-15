// app/(app)/pricing/group-form.tsx — a price group: one row of the price grid.
// CommandForm over upsert_price_group, doubling as create (no `group` prop,
// `model` from toNewPriceGroupViewProps) and edit (`group` pre-fills and the
// input carries `id`). Both branches draw the same PriceGroupView, so the
// dialog reads the same whether the row exists yet. Delete calls
// delete_price_group and shows its refusal ("price group is in use") inline,
// the way delete-channel-button.tsx does.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { PriceGroupView, type PriceGroupViewModel } from "@/components/mgr/views/price-group";
import { useCommandAction, useCommandForm } from "@/lib/commands/use-command-form";

export type PriceGroupEditData = { id: string; name: string; position: number; cost_ceiling_cents: number | null };

export function GroupForm({ group, model }: { group?: PriceGroupEditData; model: PriceGroupViewModel }) {
  const [name, setName] = useState(model.name);
  const [position, setPosition] = useState(model.position);
  const [ceiling, setCeiling] = useState(model.costCeilingInput);
  const remove = useCommandAction();
  const form = useCommandForm("upsert_price_group", {
    build: () => ({
      ...(group ? { id: group.id } : {}),
      name,
      position: Number(position),
      costCeilingCents: ceiling === "" ? undefined : Math.round(Number(ceiling) * 100),
    }),
    reset: () => { setName(model.name); setPosition(model.position); setCeiling(model.costCeilingInput); },
  });

  return (
    <CommandForm
      open={form.open}
      onOpenChange={form.setOpen}
      title={group ? "Edit price group" : "New price group"}
      trigger={group
        ? <Button variant="link" size="sm" className="px-0 font-medium">{group.name}</Button>
        : <Button>Create price group</Button>}
    >
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <PriceGroupView
          model={{ ...model, name, position, costCeilingInput: ceiling }}
          controls={{ name: setName, position: setPosition, costCeiling: setCeiling }}
          back={null}
          messages={<><CommandFormMessage error={form.error} /><CommandFormMessage error={remove.error} /></>}
          footer={<CommandFormFooter>
            {group && (
              <Button type="button" variant="ghost" disabled={remove.busy} onClick={() => remove.run("delete_price_group", { priceGroupId: group.id })}>Delete</Button>
            )}
            <Button type="submit" disabled={form.submitting}>{form.submitting ? "Saving…" : "Save price group"}</Button>
          </CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
