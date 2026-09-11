import { getServerEnv } from "@/lib/env/server";
import { E } from "@/components/mgr/e";
import { SettingsView } from "@/components/mgr/views/settings";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { redirect } from "next/navigation";
import { deniedHref } from "@/lib/mgr/denied";
import { plural } from "@/lib/mgr/plural";
import { toSettingsViewProps } from "@/lib/mgr/settings-view";
import "@/lib/commands/all";
import { PortalFulfillmentForm } from "./portal-fulfillment-form";
import { SettingsForm, type BrewerySettings } from "./settings-form";
import { AiModelSettingsForm } from "./ai-model-settings-form";
import { getGatewayLanguageModels } from "@/lib/chat/models";

export default async function SettingsPage() {
  const brewery = await getActiveBrewery();
  const serverEnv = getServerEnv();
  if (brewery.role !== "admin") redirect(deniedHref("Settings", ["admin"]));
  const ctx = await buildContext(brewery.id);
  const [row, locations, team, ai, aiModels] = await Promise.all([
    runCommand("get_brewery", {}, ctx) as Promise<BrewerySettings & { portal_fulfillment_location_id: string | null }>,
    runCommand("list_locations", {}, ctx) as Promise<{ id: string; name: string; kind: string }[]>,
    runCommand("list_team_members", {}, ctx) as Promise<unknown[]>,
    runCommand("get_brewery_ai_model", {}, ctx) as Promise<{ model: string }>,
    getGatewayLanguageModels().catch(() => []),
  ]);
  const warehouses = locations.filter((l) => l.kind === "warehouse");
  return (
    <SettingsView
      model={toSettingsViewProps({
        backHref: "/more",
        name: row.name,
        timezone: row.timezone,
        timezoneOptions: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"],
        ttb: row.ttb_registry_no ?? "",
        paLicense: row.pa_license_no ?? "",
        phone: row.customer_phone ?? "",
        overdueHours: String(row.fermentation_reading_due_hours),
        aiModel: ai.model,
        aiModels,
        deployment: `${serverEnv.dedicated ? "dedicated" : "hosted"} · read-only`,
        warehouse: warehouses.find((l) => l.id === row.portal_fulfillment_location_id)?.name ?? "",
        warehouseOptions: warehouses.map((l) => l.name),
        sourceWater: "water profiles aren’t available yet",
        locations: locations.map((l) => l.name).join(" · ") || "none yet",
        team: plural(team.length, "member"),
      })}
      breweryForm={<SettingsForm brewery={row} />}
      fulfillmentForm={<PortalFulfillmentForm key={row.portal_fulfillment_location_id ?? "unconfigured"} locations={warehouses} currentId={row.portal_fulfillment_location_id} />}
      aiModelForm={<AiModelSettingsForm current={ai.model} models={aiModels} />}
      deployment={E.fld("Deployment", `${serverEnv.dedicated ? "dedicated" : "hosted"} · read-only`)}
      links={
        <>
          {E.gated("Source water", "water profiles aren’t available yet")}
          {E.nav("Locations", locations.map((l) => l.name).join(" · ") || "none yet", "", undefined, "/locations")}
          {E.nav("Team", plural(team.length, "member"), "", undefined, "/settings/team")}
          {E.nav("Accounting", "QuickBooks connection, mappings and payment defaults", "", undefined, "/settings/accounting")}
          {E.nav("Point of sale", "Square connection, location mappings, sync and menu", "", undefined, "/settings/pos")}
          {E.nav("Chat", "Slack notifications and preferences", "", undefined, "/settings/chat")}
          {E.nav("Import", "upload, map and commit CSV rows", "", undefined, "/settings/import")}
        </>
      }
    />
  );
}
