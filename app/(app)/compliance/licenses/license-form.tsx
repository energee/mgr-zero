// app/(app)/compliance/licenses/license-form.tsx — the License sheet (screen
// record License): upsert_brewery_state_license, creating (no row) or editing
// (a row passed in) through one form. Brand approvals and state registrations
// are the brand's: app/(app)/catalog/brands/[id]/compliance-forms.tsx.
"use client";

import { CommandForm, CommandFormMessage, sheetTrigger } from "@/components/mgr/command-form";
import { ConfirmDeleteControl } from "@/components/mgr/views/confirm-delete";
import { LicenseView } from "@/components/mgr/views/license";
import type { License } from "@/lib/commands/compliance";
import { licenseInput, type LicenseViewModel } from "@/lib/mgr/license-view";
import { useCommandForm, useFields } from "@/lib/commands/use-command-form";
// state and kind are locked when editing (licenseInput omits the unshown note, so the upsert keeps it): a license is addressed by them, so changing one would add a row, not move it
export function LicenseForm({ license, existing }: { license?: License; existing?: LicenseViewModel["existing"] }) {
  const { v, set, reset } = useFields({ state: license?.state ?? "", kind: license?.kind ?? "brewery", licenseNo: license?.license_no ?? "", expiresOn: license?.expires_on ?? "" });
  const form = useCommandForm("upsert_brewery_state_license", {
    build: () => licenseInput(v),
    reset,
    target: license?.id,
  });
  const model = {
    state: v.state, kind: v.kind, licenseNo: v.licenseNo, expiresOn: v.expiresOn, existing,
  };
  const controls = {
    state: set("state"), kind: set("kind"),
    licenseNo: set("licenseNo"), expiresOn: set("expiresOn"),
  };
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={license ? "Edit license" : "New license"} trigger={sheetTrigger(!!license, "Add license", license && `${license.state} ${license.kind} license`)}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <LicenseView
          model={model}
          controls={controls}
          locked={Boolean(license)}
          messages={<CommandFormMessage error={form.error} />}
          submitting={form.submitting}
          onCancel={() => form.setOpen(false)}
          remove={license ? <ConfirmDeleteControl title="Delete license" busyLabel="Deleting…"
            name={<>Delete the <strong>{license.state} {license.kind}</strong> license?</>}
            warning="This permanently removes the brewery's state license."
            busy={form.busy} error={form.error}
            onDelete={() => form.run("delete_brewery_state_license", { licenseId: license.id }, () => form.setOpen(false), { target: license.id })} /> : null}
        />
      </form>
    </CommandForm>
  );
}
