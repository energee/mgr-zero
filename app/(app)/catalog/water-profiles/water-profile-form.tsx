// app/(app)/catalog/water-profiles/water-profile-form.tsx — CommandForm for
// upsert_water_profile around the shared WaterProfileView: Add profile with no
// profile, Edit with one.
"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { WaterProfileView } from "@/components/mgr/views/water-profile";
import { IONS, toWaterProfileFields, type WaterProfile } from "@/lib/mgr/water-profiles-view";
import { useCommandForm } from "@/lib/commands/use-command-form";

const IONS_INPUT = { calcium_ppm: "calciumPpm", magnesium_ppm: "magnesiumPpm", sodium_ppm: "sodiumPpm", sulfate_ppm: "sulfatePpm", chloride_ppm: "chloridePpm", bicarbonate_ppm: "bicarbonatePpm" } as const;

export function WaterProfileForm({ profile }: { profile?: WaterProfile }) {
  const formId = useId();
  const [fields, setFields] = useState(() => toWaterProfileFields(profile));
  const ready = fields.name.trim() !== "" && IONS.every(([key]) => fields[key] !== "" && Number(fields[key]) >= 0);
  const form = useCommandForm("upsert_water_profile", {
    build: () => ({ profileId: profile?.id, name: fields.name, ...Object.fromEntries(IONS.map(([key]) => [IONS_INPUT[key], Number(fields[key])])) }),
    reset: () => setFields(toWaterProfileFields(profile)),
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={profile ? "Edit water profile" : "Add water profile"}
      trigger={profile ? <Button variant="ghost" size="sm" data-row-action data-tap className="bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary">Edit</Button> : <Button size="sm">Add profile</Button>}
      footer={<CommandFormFooter><Button form={formId} type="submit" disabled={form.submitting || !ready}>{form.submitting ? "Saving…" : "Save profile"}</Button></CommandFormFooter>}>
      <form id={formId} onSubmit={form.submit} className="flex flex-col gap-3">
        <WaterProfileView fields={fields} onChange={(patch) => setFields((f) => ({ ...f, ...patch }))} submitting={form.submitting} footer={null} messages={<CommandFormMessage error={form.error} />} />
      </form>
    </CommandForm>
  );
}
