import { serverEnv } from "@/lib/env/server";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { redirect } from "next/navigation";
import { deniedHref } from "@/lib/mgr/denied";
import { plural } from "@/lib/mgr/plural";
import "@/lib/commands/all";
import { PortalFulfillmentForm } from "./portal-fulfillment-form";
import { SettingsForm, type BrewerySettings } from "./settings-form";

export default async function SettingsPage() {
  const brewery = await getActiveBrewery();
  if (brewery.role !== "admin") redirect(deniedHref("Settings", ["admin"]));
  const ctx = await buildContext(brewery.id);
  const [row, locations, team] = await Promise.all([
    runCommand("get_brewery", {}, ctx) as Promise<BrewerySettings & { portal_fulfillment_location_id: string | null }>,
    runCommand("list_locations", {}, ctx) as Promise<{ id: string; name: string; kind: string }[]>,
    runCommand("list_team_members", {}, ctx) as Promise<unknown[]>,
  ]);
  return (
    <>
      {E.back("More", "Settings", undefined, "/more")}
      <SettingsForm brewery={row} />
      <PortalFulfillmentForm key={row.portal_fulfillment_location_id ?? "unconfigured"} locations={locations.filter((l) => l.kind === "warehouse")} currentId={row.portal_fulfillment_location_id} />
      {E.fld("Deployment", `${serverEnv.dedicated ? "dedicated" : "hosted"} · read-only`)}
      {E.gated("Source water", "water profiles aren’t available yet")}
      {E.nav("Locations", locations.map((l) => l.name).join(" · ") || "none yet", "", undefined, "/locations")}
      {E.nav("Team", plural(team.length, "member"), "", undefined, "/settings/team")}
      {E.gated("Accounting", "QuickBooks isn’t connected yet")}
      {E.gated("Point of sale", "Square isn’t connected yet")}
      {E.nav("Chat", "Slack notifications and preferences", "", undefined, "/settings/chat")}
      {E.nav("Import", "upload, map and commit CSV rows", "", undefined, "/settings/import")}
    </>
  );
}
