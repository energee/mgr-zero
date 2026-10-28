// app/(app)/pricing/group-form.tsx — a price group: one row of the price grid.
// CommandForm over upsert_price_group, doubling as create (no `groupId`) and
// edit (`groupId` rides in the input). Both draw the same PriceGroupView from
// the same adapter, so the dialog reads the same whether the row exists yet. Delete calls
// delete_price_group and shows its refusal ("price group is in use") inline,
// the way the channel Delete does. An existing group also adds and edits pours
// (PourForm) and removes them (delete_format) in the same error slot; both
// removals confirm first. Each packaged format's UPC edits in its own sheet
// (BarcodeForm, set_price_group_barcode). Save price group is withheld, with
// its reason beside it, until the name, position and optional ceiling are valid.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { DeletePriceGroupControl, PriceGroupView, RemovePourControl, type PriceGroupViewModel } from "@/components/mgr/views/price-group";
import { PourForm } from "@/app/(app)/catalog/pour-form";
import { BarcodeForm } from "./barcode-form";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { toCents } from "@/lib/mgr/money";
import { priceGroupReason } from "@/lib/mgr/price-group-view";

export function GroupForm({ groupId, model }: { groupId?: string; model: PriceGroupViewModel }) {
  const [draft, setDraft] = useState(model);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const edit = (key: "name" | "position" | "costCeilingInput") => (value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const form = useCommandForm("upsert_price_group", {
    build: () => ({
      ...(groupId ? { id: groupId } : {}),
      name: draft.name,
      position: Number(draft.position),
      costCeilingCents: toCents(draft.costCeilingInput),
    }),
    reset: () => { setDraft(model); setValidationAttempted(false); },
  });

  return (
    <CommandForm
      open={form.open}
      onOpenChange={form.setOpen}
      title={groupId ? "Edit price group" : "New price group"}
      trigger={groupId
        ? <Button variant="link" size="sm" className="px-0 font-medium">{model.name}</Button>
        : <Button>New price group</Button>}
    >
      <form noValidate onSubmit={event => {
        setValidationAttempted(true);
        if (form.busy || priceGroupReason(draft)) { event.preventDefault(); event.stopPropagation(); return; }
        void form.submit(event);
      }} className="flex flex-col gap-4">
        <PriceGroupView
          // Only the three fields are drafts; pours come from the refreshed model, so
          // Add pour and Remove show up without reopening the dialog.
          model={{ ...model, name: draft.name, position: draft.position, costCeilingInput: draft.costCeilingInput }}
          // A refusal such as a duplicate name clears once the name is edited (#1492).
          controls={{ name: value => { edit("name")(value); form.setError(null); }, position: edit("position"), costCeiling: edit("costCeilingInput") }}
          validationAttempted={validationAttempted}
          back={null}
          addPour={groupId ? <PourForm priceGroupId={groupId} groupName={model.name} /> : undefined}
          renderPour={groupId ? (pour) => <div className="flex gap-2">
            <PourForm key={`${pour.id}-${pour.name}-${pour.ounces}`} priceGroupId={groupId} groupName={model.name} pour={{ id: pour.id, name: pour.name, ounces: Number(pour.ounces) }} />
            <RemovePourControl pour={pour.name} group={model.name} busy={form.busy} error={form.error}
              onDelete={() => form.run("delete_format", { formatId: pour.id }, undefined, { target: pour.id })} />
          </div> : undefined}
          renderBarcode={groupId ? (b) => <BarcodeForm key={b.upc} priceGroupId={groupId} groupName={model.name} formatId={b.formatId} format={b.format} upc={b.upc} /> : undefined}
          messages={<CommandFormMessage error={form.error} />}
          footer={<CommandFormFooter>
            {groupId && (
              <DeletePriceGroupControl group={model.name} busy={form.busy} error={form.error}
                onDelete={() => form.run("delete_price_group", { priceGroupId: groupId }, undefined, { target: groupId })} />
            )}
            {E.submit("Save price group", { submitting: form.submitting, disabled: form.busy, reason: priceGroupReason(draft) })}
          </CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
