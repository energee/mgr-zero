// app/(app)/compliance/licenses/page.tsx — Licenses (screen record Licenses):
// the brewery's own state licenses, each row with Edit and one add sheet
// (license-form.tsx). Brand approvals and registrations live on each Brand.
// Sales and Admin.
import { LicensesView } from "@/components/mgr/views/licenses";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import type { License } from "@/lib/commands/compliance";
import { breweryToday } from "@/lib/commands/registry";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toLicensesViewProps } from "@/lib/mgr/licenses-view";
import "@/lib/commands/all";
import { LicenseForm } from "./license-form";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/compliance/licenses") };

export default async function LicensesPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const { licenses } = (await runCommand("get_compliance_registry", {}, ctx)) as { licenses: License[] };
  const today = await breweryToday(ctx);
  return (
    <LicensesView
      model={toLicensesViewProps({
        backHref: "/compliance",
        licenses,
        today,
      })}
      actions={Object.fromEntries(licenses.map((license) => [license.id, <LicenseForm key={`${license.id}-${license.license_no}-${license.expires_on}`} license={license} />]))}
      addLicenses={<div className="py-2"><LicenseForm /></div>}
    />
  );
}
