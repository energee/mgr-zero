import { TaproomVarianceView } from "@/components/mgr/views/taproom-variance";
import type { VarianceReport } from "@/lib/mgr/taproom-variance-view";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { requirePagePermission, runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";

type Location = { id: string; name: string; kind: string };

export default async function TaproomVariancePage({ searchParams }: { searchParams: Promise<{ location?: string; weeks?: string }> }) {
  const selected = await searchParams;
  const weeks = selected.weeks === "12" ? 12 : 4;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "get_taproom_variance", "Variance by brand");
  const locations = ((await runCommand("list_locations", {}, ctx)) as Location[]).filter(location => location.kind === "taproom");
  const location = locations.find(item => item.id === selected.location) ?? locations[0];
  if (!location) return <TaproomVarianceView model={{ backHref: "/beer", weeks }} />;
  const report = await runCommand("get_taproom_variance", { locationId: location.id, weeks }, ctx) as VarianceReport;
  return <TaproomVarianceView model={{
    report, weeks, backHref: "/beer", location: location.name,
    countHref: `/taproom?location=${location.id}`, boardHref: `/taproom/board?location=${location.id}`,
    locations: locations.map(item => [item.name, `/taproom/variance?location=${item.id}&weeks=${weeks}`]),
    weekHrefs: [[ "4 weeks", `/taproom/variance?location=${location.id}&weeks=4` ], [ "12 weeks", `/taproom/variance?location=${location.id}&weeks=12` ]],
  }} />;
}
