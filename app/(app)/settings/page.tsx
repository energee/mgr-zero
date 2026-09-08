// app/(app)/settings/page.tsx — Settings (screen record): edit brewery basics
// (get_brewery → update_brewery) and route to rare setup. Locations and Team
// are live; source water, accounting, point of sale, chat and import stay
// gated until their programs ship. Deployment mode is read-only.
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { redirect } from "next/navigation";
import { deniedHref } from "@/lib/mgr/denied";
import "@/lib/commands/all";
import { SettingsForm, type BrewerySettings } from "./settings-form";

export default async function SettingsPage() {
  const brewery = await getActiveBrewery();
  if (brewery.role !== "admin") redirect(deniedHref("Settings", ["admin"]));
  const ctx = await buildContext(brewery.id);
  const [row, locations, team] = await Promise.all([
    runCommand("get_brewery", {}, ctx) as Promise<BrewerySettings>,
    runCommand("list_locations", {}, ctx) as Promise<{ name: string }[]>,
    runCommand("list_team_members", {}, ctx) as Promise<unknown[]>,
  ]);
  const nav = (href: string, t: string, s: string) => <Link key={href} href={href} className="block">{E.nav(t, s)}</Link>;
  return (
    <>
      {E.back("More", "Settings", undefined, "/more")}
      <SettingsForm brewery={row} />
      {E.fld("Deployment", "dedicated · read-only")}
      {E.gated("Source water", "water profiles aren’t available yet")}
      {nav("/locations", "Locations", locations.map((l) => l.name).join(" · ") || "none yet")}
      {nav("/settings/team", "Team", `${team.length} member${team.length === 1 ? "" : "s"}`)}
      {E.gated("Accounting", "QuickBooks isn’t connected yet")}
      {E.gated("Point of sale", "Square isn’t connected yet")}
      {nav("/settings/chat/link", "Chat", "Slack account link")}
      {E.gated("Import", "CSV import isn’t available yet")}
    </>
  );
}
