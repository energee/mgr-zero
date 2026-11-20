import { getServerEnv } from "@/lib/env/server";
import { SettingsView } from "@/components/mgr/views/settings";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { redirect } from "next/navigation";
import { deniedHref } from "@/lib/mgr/denied";
import { plural } from "@/lib/mgr/plural";
import "@/lib/commands/all";
import { PortalFulfillmentForm } from "./portal-fulfillment-form";
import { SettingsForm, type BrewerySettings } from "./settings-form";
import { AgentsSettingsForm } from "./agents-settings-form";
import { AiModelSettingsForm } from "./ai-model-settings-form";
import { getGatewayLanguageModels } from "@/lib/chat/models";
import { ReportingBasisForm } from "./reporting-basis-form";
import { GravityUnitForm } from "./gravity-unit-form";
import { ReleaseSettingsForm } from "./release-settings-form";
import { PalletRulesForm } from "./pallet-rules-form";
import type { PalletRules } from "@/lib/mgr/pallet-fit";
import { KEG_SIZES } from "@/lib/mgr/enums";
import type { ReleaseSettings, ReleaseShareRow } from "@/lib/mgr/release-settings-view";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import type { Filing, ReportingBasisCorrection } from "@/lib/commands/compliance";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/settings") };

export default async function SettingsPage() {
  const brewery = await getActiveBrewery();
  const serverEnv = getServerEnv();
  if (!brewery.roles.includes("admin")) redirect(deniedHref("Settings", ["admin"]));
  const ctx = await buildContext(brewery.id);
  const [row, locations, team, ai, aiModels, reports, basisCorrections, releaseShares, formats] = await Promise.all([
    runCommand("get_brewery", {}, ctx) as Promise<BrewerySettings & ReleaseSettings & { portal_fulfillment_location_id: string | null; gravity_unit: GravityUnit; agents_enabled: boolean; pallet_rules: PalletRules }>,
    runCommand("list_locations", {}, ctx) as Promise<{ id: string; name: string; uses: string[] }[]>,
    runCommand("list_team_members", {}, ctx) as Promise<unknown[]>,
    runCommand("get_brewery_ai_model", {}, ctx) as Promise<{ model: string }>,
    getGatewayLanguageModels(),
    runCommand("list_compliance_reports", {}, ctx) as Promise<{ filings: Filing[] }>,
    runCommand("list_reporting_basis_corrections", {}, ctx) as Promise<ReportingBasisCorrection[]>,
    runCommand("list_release_shares", {}, ctx) as Promise<ReleaseShareRow[]>,
    // The Pallets section has one column per keg size the brewery packages.
    runCommand("list_formats", { basis: "packaged" }, ctx) as Promise<{ keg_size: string | null }[]>,
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
        phone: row.customer_phone ?? "",
        overdueHours: String(row.fermentation_reading_due_hours),
        daysToPackage: String(row.days_to_package),
        booksOpenedOn: row.books_opened_on ?? "",
        hasFiledReports,
        basisCorrections,
        aiModel: ai.model,
        aiModels,
        agentsEnabled: row.agents_enabled,
        deployment: serverEnv.dedicated ? "dedicated" : "hosted",
        warehouseId: row.portal_fulfillment_location_id,
        warehouseOptions: warehouses.map(({ id, name }) => ({ id, name })),
        locations: locations.map((l) => l.name).join(" · ") || "none yet",
        team: plural(team.length, "member"),
      }}
      breweryForm={<SettingsForm key={row.books_opened_on ?? "unset"} brewery={row} hasFiledReports={hasFiledReports} />}
      unitsForm={<GravityUnitForm part="brewery" brewery={row.gravity_unit} mine={null} />}
      releaseForm={<ReleaseSettingsForm key={JSON.stringify([row.release_open_pct, row.release_order_by_days, row.release_cap_lift_days, row.release_digest_dow, row.release_share_window_days, row.release_stock_multiplier, row.release_max_share_pct])} brewery={row} shares={releaseShares} />}
      palletForm={<PalletRulesForm key={JSON.stringify(row.pallet_rules)} rules={row.pallet_rules} sizes={KEG_SIZES.filter((size) => formats.some((f) => f.keg_size === size))} />}
      reportingBasisForm={<ReportingBasisForm key={row.books_opened_on ?? "unset"} basis={row.books_opened_on} history={basisCorrections} timeZone={row.timezone} />}
      fulfillmentForm={<PortalFulfillmentForm key={row.portal_fulfillment_location_id ?? "unconfigured"} locations={warehouses} currentId={row.portal_fulfillment_location_id} />}
      aiModelForm={<AiModelSettingsForm current={ai.model} models={aiModels} />}
      agentsForm={<AgentsSettingsForm current={row.agents_enabled} />}
      hrefs={{ water: "/catalog/water-profiles?from=settings", locations: "/locations", team: "/settings/team", accounting: "/settings/accounting", pos: "/settings/pos", chat: "/settings/chat", import: "/settings/import", channels: "/settings/channels" }}
    />
  );
}
