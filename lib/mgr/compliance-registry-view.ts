// lib/mgr/compliance-registry-view.ts — get_compliance_registry → shared view.
import type { License, RegistryBrand } from "@/lib/commands/compliance";
export type RegistryRowView = {
  key: string;
  title: string;
  detail: string;
  warning?: boolean;
  verb?: string;
};

export type RegistryBrandView = {
  key: string;
  title: string;
  detail: string;
  warning?: boolean;
  rows: RegistryRowView[];
};

export type ComplianceRegistryViewModel = {
  backHref?: string;
  brands: RegistryBrandView[];
  licenses: RegistryRowView[];
  note: string;
};

export type ComplianceRegistrySnapshot = {
  backHref?: string;
  brands: RegistryBrand[];
  licenses: License[];
  note: string;
};

const expires = (date: string | null) => date ? ` · expires ${date}` : "";

export function toComplianceRegistryViewProps(s: ComplianceRegistrySnapshot): ComplianceRegistryViewModel {
  return {
    backHref: s.backHref,
    brands: s.brands.map((brand) => {
      const cola = brand.approvals.find((approval) => approval.kind === "cola");
      return {
        key: brand.id,
        title: brand.name,
        detail: cola ? `COLA ${cola.ttb_id}${expires(cola.expires_on)}` : "COLA pending",
        warning: !cola,
        rows: [
          ...brand.approvals.map((approval) => ({
            key: approval.id,
            title: `${approval.kind === "cola" ? "COLA" : "Formula"} ${approval.ttb_id}`,
            detail: `${approval.approved_on ? `approved ${approval.approved_on}` : "no approval date"}${expires(approval.expires_on)}`,
            verb: "Edit",
          })),
          ...brand.registrations.map((registration) => ({
            key: registration.id,
            title: `${registration.state} registration`,
            detail: `${registration.registration_no ?? "no number"}${expires(registration.expires_on)}`,
            verb: "Edit",
          })),
        ],
      };
    }),
    licenses: s.licenses.map((license) => ({
      key: license.id,
      title: `${license.state} ${license.kind}`,
      detail: `${license.license_no ?? "no number"}${expires(license.expires_on)}`,
      verb: "Edit",
    })),
    note: s.note,
  };
}
