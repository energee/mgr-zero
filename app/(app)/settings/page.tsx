import { getServerEnv } from "@/lib/env/server";
import { SettingsView } from "@/components/mgr/views/settings";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { redirect } from "next/navigation";
import { deniedHref } from "@/lib/mgr/denied";
import { plural } from "@/lib/mgr/plural";
import { dollarsInput } from "@/lib/mgr/money";
import "@/lib/commands/all";
import { PortalFulfillmentForm } from "./portal-fulfillment-form";
import { SettingsForm, type BrewerySettings } from "./settings-form";
import { AiModelSettingsForm } from "./ai-model-settings-form";
import { getGatewayLanguageModels } from "@/lib/chat/models";
import { ReportingBasisForm } from "./reporting-basis-form";
import { GravityUnitForm } from "./gravity-unit-form";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import type { Filing, ReportingBasisCorrection } from "@/lib/commands/compliance";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/settings") };

export default async function SettingsPage() {
  const brewery = await getActiveBrewery();
  const serverEnv = getServerEnv();
  if (!brewery.roles.includes("admin")) redirect(deniedHref("Settings", ["admin"]));
  const ctx = await buildContext(brewery.id);
  const [row, locations, team, ai, aiModels, reports, basisCorrections] = await Promise.all([
    runCommand("get_brewery", {}, ctx) as Promise<BrewerySettings & { portal_fulfillment_location_id: string | null; gravity_unit: GravityUnit }>,
    runCommand("list_locations", {}, ctx) as Promise<{ id: string; name: string; uses: string[] }[]>,
    runCommand("list_team_members", {}, ctx) as Promise<unknown[]>,
    runCommand("get_brewery_ai_model", {}, ctx) as Promise<{ model: string }>,
    getGatewayLanguageModels(),
    runCommand("list_compliance_reports", {}, ctx) as Promise<{ filings: Filing[] }>,
    runCommand("list_reporting_basis_corrections", {}, ctx) as Promise<ReportingBasisCorrection[]>,
  ]);
  // Every location is already in hand for the summary line, so the portal's
  // fulfillment sources come out of that list rather than a second read.
  const warehouses = locations.filter((l) => l.uses.includes("warehouse"));
  const hasFiledReports = reports.filings.length > 0;
  return (
    <SettingsView
      model={{
        backHref: "/more",
        name: row.name,
        timezone: row.timezone,
        timezoneOptions: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"],
        ttb: row.ttb_registry_no ?? "",
        paLicense: row.pa_license_no ?? "",
        phone: row.customer_phone ?? "",
        overdueHours: String(row.fermentation_reading_due_hours),
        daysToPackage: String(row.days_to_package),
        booksOpenedOn: row.books_opened_on ?? "",
        hasFiledReports,
        basisCorrections,
        oneWayKegFee: dollarsInput(row.one_way_keg_fee_cents),
        aiModel: ai.model,
        aiModels,
        deployment: serverEnv.dedicated ? "dedicated" : "hosted",
        warehouseId: row.portal_fulfillment_location_id,
        warehouseOptions: warehouses.map(({ id, name }) => ({ id, name })),
        locations: locations.map((l) => l.name).join(" · ") || "none yet",
        team: plural(team.length, "member"),
      }}
      breweryForm={<SettingsForm key={row.books_opened_on ?? "unset"} brewery={row} hasFiledReports={hasFiledReports} />}
      unitsForm={<GravityUnitForm part="brewery" brewery={row.gravity_unit} mine={null} />}
      reportingBasisForm={<ReportingBasisForm key={row.books_opened_on ?? "unset"} basis={row.books_opened_on} history={basisCorrections} timeZone={row.timezone} />}
      fulfillmentForm={<PortalFulfillmentForm key={row.portal_fulfillment_location_id ?? "unconfigured"} locations={warehouses} currentId={row.portal_fulfillment_location_id} />}
      aiModelForm={<AiModelSettingsForm current={ai.model} models={aiModels} />}
      hrefs={{ water: "/catalog/water-profiles?from=settings", locations: "/locations", team: "/settings/team", accounting: "/settings/accounting", pos: "/settings/pos", chat: "/settings/chat", import: "/settings/import", channels: "/settings/channels" }}
    />
  );
}
