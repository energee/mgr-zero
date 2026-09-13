// app/(app)/pricing/group-form.tsx — a price group: one row of the price grid.
// CommandForm over upsert_price_group, doubling as create (no `group` prop,
// position pre-filled with `defaultPosition`) and edit (`group` pre-fills and
// the input carries `id`). Delete calls delete_price_group and shows its refusal
// ("price group is in use") inline, the way delete-channel-button.tsx does.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PriceGroupView, type PriceGroupViewModel } from "@/components/mgr/views/price-group";
import { useCommandAction, useCommandForm } from "@/lib/commands/use-command-form";

export type PriceGroupEditData = { id: string; name: string; position: number; cost_ceiling_cents: number | null };

export function GroupForm({ group, model, defaultPosition = 1 }: { group?: PriceGroupEditData; model?: PriceGroupViewModel; defaultPosition?: number }) {
  const isEdit = !!group;
  const initialName = group?.name ?? "";
  const initialPosition = String(group?.position ?? defaultPosition);
  const initialCeiling = group?.cost_ceiling_cents == null ? "" : (group.cost_ceiling_cents / 100).toFixed(2);
  const [name, setName] = useState(initialName);
  const [position, setPosition] = useState(initialPosition);
  const [ceiling, setCeiling] = useState(initialCeiling);
  const remove = useCommandAction();
  const form = useCommandForm("upsert_price_group", {
    build: () => ({
      ...(isEdit ? { id: group.id } : {}),
      name,
      position: Number(position),
      costCeilingCents: ceiling === "" ? undefined : Math.round(Number(ceiling) * 100),
    }),
    reset: () => { setName(initialName); setPosition(initialPosition); setCeiling(initialCeiling); },
  });

  return (
    <CommandForm
      open={form.open}
      onOpenChange={form.setOpen}
      title={isEdit ? "Edit price group" : "New price group"}
      trigger={
        <Button variant={isEdit ? "ghost" : "default"} size={isEdit ? "sm" : "default"}>
          {isEdit ? group.name : "Create price group"}
        </Button>
      }
    >
      {model ? <form onSubmit={form.submit} className="flex flex-col gap-4">
        <PriceGroupView
          model={{ ...model, name, position, costCeilingInput: ceiling }}
          controls={{ name: setName, position: setPosition, costCeiling: setCeiling }}
          back={null}
          messages={<><CommandFormMessage error={form.error} /><CommandFormMessage error={remove.error} /></>}
          footer={<CommandFormFooter>
            <Button type="button" variant="ghost" disabled={remove.busy} onClick={() => remove.run("delete_price_group", { priceGroupId: group!.id })}>Delete</Button>
            <Button type="submit" disabled={form.submitting}>{form.submitting ? "Saving…" : "Save price group"}</Button>
          </CommandFormFooter>}
        />
      </form> : <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="group-name">Name</Label>
          <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="group-position">Position</Label>
          <Input id="group-position" type="number" min="1" step="1" value={position} onChange={(e) => setPosition(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="group-ceiling">Cost ceiling ($/bbl, optional)</Label>
          <Input id="group-ceiling" type="number" step="0.01" min="0" value={ceiling} onChange={(e) => setCeiling(e.target.value)} />
        </div>
        <p className="text-sm text-muted-foreground">
          Groups sort by position. A cost ceiling only suggests a group; nobody is moved automatically.
        </p>
        <CommandFormMessage error={form.error} />
        <CommandFormMessage error={remove.error} />
        <CommandFormFooter>
          {isEdit && (
            <Button type="button" variant="ghost" disabled={remove.busy} onClick={() => remove.run("delete_price_group", { priceGroupId: group.id })}>
              Delete
            </Button>
          )}
          <Button type="submit" disabled={form.submitting}>{form.submitting ? "Saving…" : "Save price group"}</Button>
        </CommandFormFooter>
      </form>}
    </CommandForm>
  );
}
