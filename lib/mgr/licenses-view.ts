// lib/mgr/licenses-view.ts — get_compliance_registry.licenses → shared view.
// The brewery's own state licenses, one per state and kind. Brand approvals
// and state registrations are the brand's and paint on Brand (brand-view.ts).
import type { License } from "@/lib/commands/compliance";

export type LicenseRowView = {
  key: string;
  title: string;
  detail: string;
  verb?: string;
};

export type LicensesViewModel = {
  backHref?: string;
  licenses: LicenseRowView[];
  note: string;
};

export type LicensesSnapshot = {
  backHref?: string;
  licenses: License[];
  note: string;
};

const expires = (date: string | null) => date ? ` · expires ${date}` : "";

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
