// app/(app)/catalog/water-profiles/page.tsx — Water profiles (screen record):
// the brewery's source and target waters from list_water_profiles, each
// with Edit → water-profile-form.tsx; Add profile opens the same sheet empty.
// Brewer and Admin.
import { WaterProfilesView } from "@/components/mgr/views/water-profiles";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toWaterProfilesViewProps, type WaterProfile } from "@/lib/mgr/water-profiles-view";
import "@/lib/commands/all";
import { WaterProfileForm } from "./water-profile-form";

export default async function WaterProfilesPage() {
  const brewery = await getActiveBrewery();
  const profiles = (await runCommand("list_water_profiles", {}, await buildContext(brewery.id))) as WaterProfile[];
  return (
    <WaterProfilesView
      model={toWaterProfilesViewProps({ profiles, backHref: "/catalog" })}
      createAction={<WaterProfileForm />}
      profileActions={Object.fromEntries(profiles.map((p) => [p.id, <WaterProfileForm key={JSON.stringify(p)} profile={p} />]))}
    />
  );
}
