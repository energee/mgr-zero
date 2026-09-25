// app/(app)/catalog/brands/[id]/compliance-forms.tsx — the brand's two
// compliance sheets (screen records Brand approval, State registration):
// upsert_brand_approval and upsert_state_registration, each creating (no row)
// or editing (a row passed in). The brand is fixed: the sheet is only ever
// opened from one brand, so it is stated, not picked.
"use client";

import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage, sheetTrigger } from "@/components/mgr/command-form";
import { BrandApprovalView } from "@/components/mgr/views/brand-approval";
import { StateRegistrationView } from "@/components/mgr/views/state-registration";
import type { Approval, Registration } from "@/lib/commands/compliance";
import { useCommandForm, useFields } from "@/lib/commands/use-command-form";
import { APPROVAL_KINDS, approvalInput } from "@/lib/mgr/brand-approval-view";
import { registrationInput } from "@/lib/mgr/state-registration-view";
type Brand = { id: string; name: string };

export function ApprovalForm({ brand, approval }: { brand: Brand; approval?: Approval }) {
  // No expiry field: a COLA does not expire. The expires_on column and note
  // are not shown; approvalInput omits them, so the upsert keeps them (#438, #522).
  const { v, set, reset } = useFields({ kind: approval?.kind ?? "cola", ttbId: approval?.ttb_id ?? "", submittedOn: approval?.approved_on ?? "" });
  const form = useCommandForm("upsert_brand_approval", {
    build: () => approvalInput(brand.id, v, approval),
    reset,
  });
  const model = {
    brand: brand.name,
    kind: v.kind,
    kindOptions: APPROVAL_KINDS,
    number: v.ttbId,
    submittedOn: v.submittedOn,
  };
  const controls = { kind: set("kind"), number: set("ttbId"), submittedOn: set("submittedOn") };
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Brand approval" trigger={sheetTrigger(!!approval, "Add approval")}>
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
  // state is locked when editing: a registration is addressed by brand and state, so changing it would add a row, not move it.
  // approved_on is not shown; registrationInput omits it, so the upsert keeps it (#438, #522).
  const { v, set, reset } = useFields({ state: registration?.state ?? "", registrationNo: registration?.registration_no ?? "", expiresOn: registration?.expires_on ?? "" });
  const form = useCommandForm("upsert_state_registration", {
    build: () => registrationInput(brand.id, v),
    reset,
  });
  const model = {
    brand: brand.name,
    state: v.state, registrationNo: v.registrationNo, expiresOn: v.expiresOn,
  };
  const controls = { state: set("state"), registrationNo: set("registrationNo"), expiresOn: set("expiresOn") };
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="State registration" trigger={sheetTrigger(!!registration, "Add registration")}>
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
