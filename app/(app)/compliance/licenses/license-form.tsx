// app/(app)/compliance/licenses/license-form.tsx — the License sheet (screen
// record License): upsert_brewery_state_license, creating (no row) or editing
// (a row passed in) through one form. Brand approvals and state registrations
// are the brand's: app/(app)/catalog/brands/[id]/compliance-forms.tsx.
"use client";

import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage, sheetTrigger } from "@/components/mgr/command-form";
import { LicenseView } from "@/components/mgr/views/license";
import type { License } from "@/lib/commands/compliance";
import { licenseInput } from "@/lib/mgr/license-view";
import { useCommandForm, useFields } from "@/lib/commands/use-command-form";
// state and kind are locked when editing (licenseInput omits the unshown note, so the upsert keeps it): a license is addressed by them, so changing one would add a row, not move it
export function LicenseForm({ license }: { license?: License }) {
  const { v, set, reset } = useFields({ state: license?.state ?? "", kind: license?.kind ?? "brewery", licenseNo: license?.license_no ?? "", expiresOn: license?.expires_on ?? "" });
  const form = useCommandForm("upsert_brewery_state_license", {
    build: () => licenseInput(v),
    reset,
  });
  const model = {
    state: v.state, kind: v.kind, licenseNo: v.licenseNo, expiresOn: v.expiresOn,
  };
  const controls = {
    state: set("state"), kind: set("kind"),
    licenseNo: set("licenseNo"), expiresOn: set("expiresOn"),
  };
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="License" trigger={sheetTrigger(!!license, "Add license")}>
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
