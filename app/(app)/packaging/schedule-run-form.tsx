// app/(app)/packaging/schedule-run-form.tsx — CommandForm for
// schedule_packaging_run over the shared SchedulePackagingRunView: the brand
// being packaged and the date commit the run; the source tank is optional here
// (picked later, on the run's own page); outputs are a planned count per
// package of the chosen brand. The model comes from the page's reads through
// toSchedulePackagingRunView; the shared requirement query supplies current shortages.
"use client";

import { useCommandQuery } from "@/components/mgr/query-provider";
import type { PackagingRequirement } from "@/lib/mgr/packaging-actuals";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { SchedulePackagingRunView } from "@/components/mgr/views/schedule-packaging-run";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { plannedQty, toSchedulePackagingRunView, type ScheduleRunData, type ScheduleRunDraft } from "@/lib/mgr/schedule-packaging-run-view";

const EMPTY: ScheduleRunDraft = { brandId: "", occupancyId: "", plannedOn: "", qty: {} };

export function ScheduleRunForm(data: ScheduleRunData) {
  const [draft, setDraft] = useState(EMPTY);
  const change = (patch: Partial<ScheduleRunDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const model = toSchedulePackagingRunView(data, draft);
  const outputs = model.outputs
    .filter((output) => plannedQty(output.qty) > 0)
    .map((output) => ({ skuId: output.key, qtyPlanned: plannedQty(output.qty) }));
  const form = useCommandForm("schedule_packaging_run", {
    build: () => ({ brandId: draft.brandId, plannedOn: draft.plannedOn, occupancyId: draft.occupancyId || undefined, outputs }),
    reset: () => setDraft(EMPTY),
  });
  const materials = useCommandQuery<{ planned: PackagingRequirement[] }>("get_packaging_material_plan", { outputs }, form.open && outputs.length > 0);
  const ready = draft.brandId && draft.plannedOn && outputs.length > 0;
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Schedule run" trigger={<Button size="sm">Schedule run</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <SchedulePackagingRunView
          model={{ ...model, materials: materials.data?.planned.map(row => [`${row.name} ${row.qty} ${row.unit}`, row.onHand ?? "—", row.short === undefined ? "—" : Math.max(0, row.short)]), materialsMessage: outputs.length ? "Loading material requirements…" : "Choose planned outputs to preview materials.", warning: materials.data?.planned.some(row => row.short !== undefined && row.short > 0) ? "Shortages do not prevent saving this plan. Closing requires enough stock for confirmed used plus lost quantities." : undefined }}
          controls={{
            plannedOn: (plannedOn) => change({ plannedOn }),
            brand: (brandId) => change({ brandId }),
            source: (occupancyId) => change({ occupancyId }),
            qty: (skuId, value) => setDraft((prev) => ({ ...prev, qty: { ...prev.qty, [skuId]: value } })),
          }}
          messages={<CommandFormMessage error={form.error ?? (materials.error instanceof Error ? materials.error.message : null)} />}
          footer={<CommandFormFooter><Button type="submit" disabled={form.submitting || !ready}>{form.submitting ? "Saving…" : "Save run plan"}</Button></CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
