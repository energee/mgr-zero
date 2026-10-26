// lib/mgr/licenses-view.ts — get_compliance_registry.licenses → shared view.
// The brewery's own state licenses, one per state and kind. Brand approvals
// and state registrations are the brand's and paint on Brand (brand-view.ts).
import type { License } from "@/lib/commands/compliance";
import { expires, type RegistryRowView } from "@/lib/mgr/registry-rows";

export type LicensesViewModel = {
  backHref?: string;
  licenses: RegistryRowView[];
};

export type LicensesSnapshot = {
  backHref?: string;
  today: string;
  licenses: License[];
};

export function toLicensesViewProps(s: LicensesSnapshot): LicensesViewModel {
  return {
    backHref: s.backHref,
    licenses: s.licenses.map((license) => {
      const expired = license.expires_on !== null && license.expires_on < s.today;
      return {
        key: license.id,
        title: `${license.state} ${license.kind}`,
        detail: `${license.license_no ?? "no number"}${expires(license.expires_on)}${expired ? " · expired" : ""}`,
        ...(expired ? { warning: true } : {}),
        verb: "Edit",
      };
    }),
  };
}
