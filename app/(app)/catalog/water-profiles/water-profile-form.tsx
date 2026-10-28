// app/(app)/catalog/water-profiles/water-profile-form.tsx — CommandForm for
// upsert_water_profile around the shared WaterProfileView: Add water profile
// with no profile, Edit with one. Save waits for a name, six nonnegative ions,
// and any alkalinity (nonnegative) or water pH (0–14) entered in range.
"use client";
import { useId, useState } from "react";
import { E } from "@/components/mgr/e";
import { CommandForm, CommandFormFooter, CommandFormMessage, sheetTrigger } from "@/components/mgr/command-form";
import { WaterProfileView } from "@/components/mgr/views/water-profile";
import { toWaterProfileFields, toWaterProfileInput, waterProfileSaveReason, type WaterProfile } from "@/lib/mgr/water-profiles-view";
import { useCommandForm } from "@/lib/commands/use-command-form";

export function WaterProfileForm({ profile }: { profile?: WaterProfile }) {
  const formId = useId();
  const [fields, setFields] = useState(() => toWaterProfileFields(profile));
  const [validationAttempted, setValidationAttempted] = useState(false);
  const reason = waterProfileSaveReason(fields);
  const form = useCommandForm("upsert_water_profile", {
    validationFields: ["name"],
    build: () => ({ profileId: profile?.id, ...toWaterProfileInput(fields) }),
    reset: () => { setFields(toWaterProfileFields(profile)); setValidationAttempted(false); },
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={profile ? "Edit water profile" : "Add water profile"}
      trigger={sheetTrigger(Boolean(profile), "Add water profile", profile?.name)}
      footer={<CommandFormFooter>{E.submit("Save water profile", { form: formId, reason, submitting: form.submitting })}</CommandFormFooter>}>
      <form id={formId} noValidate onSubmit={event => {
        setValidationAttempted(true);
        if (form.busy || reason) { event.preventDefault(); event.stopPropagation(); return; }
        void form.submit(event);
      }} className="flex flex-col gap-3">
        <WaterProfileView fields={fields} onChange={(patch) => setFields((f) => ({ ...f, ...patch }))} validationAttempted={validationAttempted} submitting={form.submitting} nameError={form.fieldErrors.name} footer={null} messages={<CommandFormMessage error={form.error} />} />
      </form>
    </CommandForm>
  );
}
