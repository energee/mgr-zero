// app/(app)/compliance/registry/registry-forms.tsx — the three registry
// sheets (screen records Brand approval, State registration, License):
// upsert_brand_approval, upsert_state_registration, upsert_brewery_state_license.
// Each creates (no row) or edits (a row passed in) through one form.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { BrandApprovalView } from "@/components/mgr/views/brand-approval";
import { LicenseView } from "@/components/mgr/views/license";
import { StateRegistrationView } from "@/components/mgr/views/state-registration";
import type { Approval, License, Registration } from "@/lib/commands/compliance";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { toBrandApprovalViewProps } from "@/lib/mgr/brand-approval-view";
import { toLicenseViewProps } from "@/lib/mgr/license-view";
import { toStateRegistrationViewProps } from "@/lib/mgr/state-registration-view";

type Brand = { id: string; name: string };
// key fields are locked when editing: registrations and licenses are addressed by them, so changing one would add a row, not move it
const trigger = (edit: boolean, add: string) => edit ? <Button variant="ghost" size="sm">Edit</Button> : <Button size="sm">{add}</Button>;
// One state object per sheet: the initial values come from the row being edited (or blanks), reset restores them.
function useFields<T extends Record<string, string>>(initial: T) {
  const [v, setV] = useState(initial);
  const set = (k: keyof T) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  return { v, set, reset: () => setV(initial) };
}
const orUndef = (s: string) => s || undefined;


export function ApprovalForm({ brands, approval }: { brands: Brand[]; approval?: Approval }) {
  // No expiry: a COLA does not expire. The expires_on column stays until a
  // migration drops it [SCHEMA-GATE] and is simply never sent from here.
  const { v, set, reset } = useFields({ brandId: approval?.brand_id ?? "", kind: approval?.kind ?? "cola", ttbId: approval?.ttb_id ?? "", submittedOn: approval?.approved_on ?? "" });
  const form = useCommandForm("upsert_brand_approval", {
    build: () => ({ id: approval?.id, brandId: v.brandId, kind: v.kind, ttbId: v.ttbId, approvedOn: orUndef(v.submittedOn) }),
    reset,
  });
  const model = toBrandApprovalViewProps({
    brandId: v.brandId,
    brand: brands.find(({ id }) => id === v.brandId)?.name ?? "Choose a brand",
    brandOptions: brands.map(({ id, name: label }) => ({ id, label })),
    kind: v.kind,
    kindOptions: [{ value: "cola", label: "COLA" }, { value: "formula", label: "Formula" }],
    number: v.ttbId,
    submittedOn: v.submittedOn,
  });
  const controls = {
    brandId: set("brandId"), kind: set("kind"), number: set("ttbId"),
    submittedOn: set("submittedOn"),
  };
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Brand approval" trigger={trigger(!!approval, "Add approval")}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <BrandApprovalView
          model={model}
          controls={controls}
          messages={<CommandFormMessage error={form.error} />}
          footer={<CommandFormFooter><Button type="submit" disabled={form.submitting || !v.brandId || !v.ttbId.trim()}>{form.submitting ? "Saving…" : "Save approval"}</Button></CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}

export function RegistrationForm({ brands, registration }: { brands: Brand[]; registration?: Registration }) {
  const { v, set, reset } = useFields({ brandId: registration?.brand_id ?? "", state: registration?.state ?? "", registrationNo: registration?.registration_no ?? "", expiresOn: registration?.expires_on ?? "" });
  const form = useCommandForm("upsert_state_registration", {
    build: () => ({ brandId: v.brandId, state: v.state.toUpperCase(), registrationNo: orUndef(v.registrationNo), expiresOn: orUndef(v.expiresOn) }),
    reset,
  });
  const model = toStateRegistrationViewProps({
    brandId: v.brandId,
    brand: brands.find(({ id }) => id === v.brandId)?.name ?? "Choose a brand",
    brandOptions: brands.map(({ id, name: label }) => ({ id, label })),
    state: v.state,
    registrationNo: v.registrationNo,
    expiresOn: v.expiresOn,
  });
  const controls = {
    brandId: set("brandId"), state: set("state"),
    registrationNo: set("registrationNo"), expiresOn: set("expiresOn"),
  };
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="State registration" trigger={trigger(!!registration, "Add registration")}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <StateRegistrationView
          model={model}
          controls={controls}
          locked={Boolean(registration)}
          messages={<CommandFormMessage error={form.error} />}
          footer={<CommandFormFooter><Button type="submit" disabled={form.submitting || !v.brandId || !/^[A-Za-z]{2}$/.test(v.state)}>{form.submitting ? "Saving…" : "Save registration"}</Button></CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}

export function LicenseForm({ license }: { license?: License }) {
  const { v, set, reset } = useFields({ state: license?.state ?? "", kind: license?.kind ?? "brewery", licenseNo: license?.license_no ?? "", expiresOn: license?.expires_on ?? "" });
  const form = useCommandForm("upsert_brewery_state_license", {
    build: () => ({ state: v.state.toUpperCase(), kind: v.kind, licenseNo: orUndef(v.licenseNo), expiresOn: orUndef(v.expiresOn) }),
    reset,
  });
  const model = toLicenseViewProps({
    state: v.state, kind: v.kind, licenseNo: v.licenseNo, expiresOn: v.expiresOn,
  });
  const controls = {
    state: set("state"), kind: set("kind"),
    licenseNo: set("licenseNo"), expiresOn: set("expiresOn"),
  };
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="License" trigger={trigger(!!license, "Add license")}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <LicenseView
          model={model}
          controls={controls}
          locked={Boolean(license)}
          messages={<CommandFormMessage error={form.error} />}
          footer={<CommandFormFooter><Button type="submit" disabled={form.submitting || !/^[A-Za-z]{2}$/.test(v.state) || !v.kind.trim()}>{form.submitting ? "Saving…" : "Save license"}</Button></CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
