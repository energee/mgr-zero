// lib/mgr/licenses-view.ts — get_compliance_registry.licenses → shared view.
// The brewery's own state licenses, one per state and kind. Brand approvals
// and state registrations are the brand's and paint on Brand (brand-view.ts).
import type { License } from "@/lib/commands/compliance";
import { expires, type RegistryRowView } from "@/lib/mgr/registry-rows";

export type LicensesViewModel = {
  backHref?: string;
  licenses: RegistryRowView[];
  note: string;
};

export type LicensesSnapshot = {
  backHref?: string;
  licenses: License[];
  note: string;
};

export function toLicensesViewProps(s: LicensesSnapshot): LicensesViewModel {
  return {
    backHref: s.backHref,
    licenses: s.licenses.map((license) => ({
      key: license.id,
      title: `${license.state} ${license.kind}`,
      detail: `${license.license_no ?? "no number"}${expires(license.expires_on)}`,
      verb: "Edit",
    })),
    note: s.note,
  };
}
