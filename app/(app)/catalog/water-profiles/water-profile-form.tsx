// app/(app)/catalog/water-profiles/water-profile-form.tsx — CommandForm for
// upsert_water_profile around the shared WaterProfileView: Add water profile
// with no profile, Edit with one. Save waits for a name, six nonnegative ions,
// and any alkalinity (nonnegative) or water pH (0–14) entered in range.
"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage, sheetTrigger } from "@/components/mgr/command-form";
import { WaterProfileView } from "@/components/mgr/views/water-profile";
import { IONS, toWaterProfileFields, toWaterProfileInput, waterPhError, type WaterProfile } from "@/lib/mgr/water-profiles-view";
import { useCommandForm } from "@/lib/commands/use-command-form";

export function WaterProfileForm({ profile }: { profile?: WaterProfile }) {
  const formId = useId();
  const [fields, setFields] = useState(() => toWaterProfileFields(profile));
  const [validationAttempted, setValidationAttempted] = useState(false);
  const ready = fields.name.trim() !== "" && IONS.every(([key]) => fields[key] !== "" && Number(fields[key]) >= 0)
    && (fields.alkalinity_ppm === "" || Number(fields.alkalinity_ppm) >= 0) && !waterPhError(fields.water_ph);
  const form = useCommandForm("upsert_water_profile", {
    build: () => ({ profileId: profile?.id, ...toWaterProfileInput(fields) }),
    reset: () => { setFields(toWaterProfileFields(profile)); setValidationAttempted(false); },
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={profile ? "Edit water profile" : "Add water profile"}
      trigger={sheetTrigger(Boolean(profile), "Add water profile", profile?.name)}
      footer={<CommandFormFooter><Button form={formId} type="submit" disabled={form.submitting || !ready}>{form.submitting ? "Saving…" : "Save water profile"}</Button></CommandFormFooter>}>
      <form id={formId} noValidate onSubmit={event => {
        setValidationAttempted(true);
        if (form.busy || !ready) { event.preventDefault(); event.stopPropagation(); return; }
        void form.submit(event);
      }} className="flex flex-col gap-3">
        <WaterProfileView fields={fields} onChange={(patch) => setFields((f) => ({ ...f, ...patch }))} validationAttempted={validationAttempted} submitting={form.submitting} footer={null} messages={<CommandFormMessage error={form.error} />} />
      </form>
    </CommandForm>
  );
}
