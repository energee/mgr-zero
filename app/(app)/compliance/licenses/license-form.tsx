// app/(app)/compliance/licenses/license-form.tsx — the License sheet (screen
// record License): upsert_brewery_state_license, creating (no row) or editing
// (a row passed in) through one form. Brand approvals and state registrations
// are the brand's: app/(app)/catalog/brands/[id]/compliance-forms.tsx.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { LicenseView } from "@/components/mgr/views/license";
import type { License } from "@/lib/commands/compliance";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { toLicenseViewProps } from "@/lib/mgr/license-view";

// key fields are locked when editing: a license is addressed by state and kind, so changing one would add a row, not move it
const trigger = (edit: boolean, add: string) => edit ? <Button variant="ghost" size="sm">Edit</Button> : <Button variant="outline" size="sm">{add}</Button>;
// One state object per sheet: the initial values come from the row being edited (or blanks), reset restores them.
function useFields<T extends Record<string, string>>(initial: T) {
  const [v, setV] = useState(initial);
  const set = (k: keyof T) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  return { v, set, reset: () => setV(initial) };
}
const orUndef = (s: string) => s || undefined;


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
