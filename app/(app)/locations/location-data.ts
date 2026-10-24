import { cache } from "react";
import { notFound } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext, isUuid } from "@/lib/commands/context";
import { runPageQuery } from "@/lib/mgr/page-query";
import type { LocationUse } from "@/lib/mgr/enums";
import "@/lib/commands/all";

type LocationRow = { id: string; name: string; uses: LocationUse[] };

/** Share the authorized location lookup between both pages and their metadata. */
export const getLocationPageData = cache(async function getLocationPageData(id: string) {
  if (!isUuid(id)) notFound();
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const locations = await runPageQuery("list_locations", {}, ctx) as LocationRow[];
  const location = locations.find((row) => row.id === id);
  if (!location) notFound();
  return { brewery, ctx, location };
});
