// app/(app)/catalog/brands/[id]/compliance-forms.tsx — the brand's two
// compliance sheets (screen records Brand approval, State registration):
// upsert_brand_approval and upsert_state_registration, each creating (no row)
// or editing (a row passed in). The brand is fixed: the sheet is only ever
// opened from one brand, so it is stated, not picked (empty brandOptions).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { BrandApprovalView } from "@/components/mgr/views/brand-approval";
import { StateRegistrationView } from "@/components/mgr/views/state-registration";
import type { Approval, Registration } from "@/lib/commands/compliance";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { toBrandApprovalViewProps } from "@/lib/mgr/brand-approval-view";
import { toStateRegistrationViewProps } from "@/lib/mgr/state-registration-view";

type Brand = { id: string; name: string };
const trigger = (edit: boolean, add: string) => edit ? <Button variant="ghost" size="sm">Edit</Button> : <Button variant="outline" size="sm">{add}</Button>;
function useFields<T extends Record<string, string>>(initial: T) {
  const [v, setV] = useState(initial);
  const set = (k: keyof T) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  return { v, set, reset: () => setV(initial) };
}
const orUndef = (s: string) => s || undefined;

export function ApprovalForm({ brand, approval }: { brand: Brand; approval?: Approval }) {
  // No expiry: a COLA does not expire. The expires_on column stays until a
  // migration drops it and is simply never sent from here.
  const { v, set, reset } = useFields({ kind: approval?.kind ?? "cola", ttbId: approval?.ttb_id ?? "", submittedOn: approval?.approved_on ?? "" });
  const form = useCommandForm("upsert_brand_approval", {
    build: () => ({ id: approval?.id, brandId: brand.id, kind: v.kind, ttbId: v.ttbId, approvedOn: orUndef(v.submittedOn) }),
    reset,
  });
  const model = toBrandApprovalViewProps({
    brandId: brand.id, brand: brand.name, brandOptions: [],
    kind: v.kind,
    kindOptions: [{ value: "cola", label: "COLA" }, { value: "formula", label: "Formula" }],
    number: v.ttbId,
    submittedOn: v.submittedOn,
  });
  const controls = { kind: set("kind"), number: set("ttbId"), submittedOn: set("submittedOn") };
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Brand approval" trigger={trigger(!!approval, "Add approval")}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <BrandApprovalView
          model={model}
          controls={controls}
          messages={<CommandFormMessage error={form.error} />}
          footer={<CommandFormFooter><Button type="submit" disabled={form.submitting || !v.ttbId.trim()}>{form.submitting ? "Saving…" : "Save approval"}</Button></CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}

export function RegistrationForm({ brand, registration }: { brand: Brand; registration?: Registration }) {
  // state is locked when editing: a registration is addressed by brand and state, so changing it would add a row, not move it
  const { v, set, reset } = useFields({ state: registration?.state ?? "", registrationNo: registration?.registration_no ?? "", expiresOn: registration?.expires_on ?? "" });
  const form = useCommandForm("upsert_state_registration", {
    build: () => ({ brandId: brand.id, state: v.state.toUpperCase(), registrationNo: orUndef(v.registrationNo), expiresOn: orUndef(v.expiresOn) }),
    reset,
  });
  const model = toStateRegistrationViewProps({
    brandId: brand.id, brand: brand.name, brandOptions: [],
    state: v.state, registrationNo: v.registrationNo, expiresOn: v.expiresOn,
  });
  const controls = { state: set("state"), registrationNo: set("registrationNo"), expiresOn: set("expiresOn") };
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="State registration" trigger={trigger(!!registration, "Add registration")}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <StateRegistrationView
          model={model}
          controls={controls}
          locked={Boolean(registration)}
          messages={<CommandFormMessage error={form.error} />}
          footer={<CommandFormFooter><Button type="submit" disabled={form.submitting || !/^[A-Za-z]{2}$/.test(v.state)}>{form.submitting ? "Saving…" : "Save registration"}</Button></CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
