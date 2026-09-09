// app/(app)/compliance/registry/page.tsx — Compliance registry (screen record
// Compliance registry): every brand with its approvals and state
// registrations, and the brewery's state licenses, each row with Edit and each
// group with an add sheet (registry-forms.tsx). Sales and Admin.
import { ComplianceRegistryView } from "@/components/mgr/views/compliance-registry";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import type { License, RegistryBrand } from "@/lib/commands/compliance";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toComplianceRegistryViewProps } from "@/lib/mgr/compliance-registry-view";
import "@/lib/commands/all";
import { ApprovalForm, LicenseForm, RegistrationForm } from "./registry-forms";

export default async function RegistryPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const { brands, licenses } = (await runCommand("get_compliance_registry", {}, ctx)) as { brands: RegistryBrand[]; licenses: License[] };
  // the sheets need only id + name; the nested lists would otherwise ride along once per row
  const picks = brands.map(({ id, name }) => ({ id, name }));
  return (
    <ComplianceRegistryView
      model={toComplianceRegistryViewProps({
        backHref: "/compliance",
        brands,
        licenses,
        note: "Order confirmation does not read this registry yet; a warning for an unregistered destination state is planned and will never block.",
      })}
      actions={Object.fromEntries([
        ...brands.flatMap((brand) => [
          ...brand.approvals.map((approval) => [approval.id, <ApprovalForm key={`${approval.id}-${approval.ttb_id}-${approval.approved_on}-${approval.expires_on}`} brands={picks} approval={approval} />]),
          ...brand.registrations.map((registration) => [registration.id, <RegistrationForm key={`${registration.id}-${registration.registration_no}-${registration.expires_on}`} brands={picks} registration={registration} />]),
        ]),
        ...licenses.map((license) => [license.id, <LicenseForm key={`${license.id}-${license.license_no}-${license.expires_on}`} license={license} />]),
      ])}
      addBrands={brands.length ? <div className="flex gap-2 py-2"><ApprovalForm brands={picks} /><RegistrationForm brands={picks} /></div> : null}
      addLicenses={<div className="py-2"><LicenseForm /></div>}
    />
  );
}
