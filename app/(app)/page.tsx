// app/(app)/page.tsx — Today: the role-filtered work list from get_today,
// drawn to the Today screen record (components/mgr/screens.tsx) in the E
// vocabulary. The row verb is the action and opens the item's href; the
// role's quick actions (todayActions) sit above the rows. An admin on a
// brewery without both a location and a brand sees the First-run checklist (first-run.tsx) instead.
// Screens stay fixtures: nothing here imports SCREENS.
import { E } from "@/components/mgr/e";
import { TodayView } from "@/components/mgr/views/today";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import type { TodayItem } from "@/lib/commands/today";
import { todayActions, toTodayViewProps } from "@/lib/mgr/today-view";
import "@/lib/commands/all";
import { FirstRunChecklist, showFirstRun, type FirstRun } from "./first-run";
import { taproomTodayRows } from "@/lib/mgr/taproom-today";
import type { TapInterval } from "@/lib/mgr/tap-board-state";
import { formatDayHeader } from "@/lib/date-format";
import { onlyRoles } from "@/lib/mgr/roles";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/") };

export default async function TodayPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const date = formatDayHeader(new Date(), brewery.timeZone);
  // Admin reads Today alongside the first-run state, not after it; a new brewery's Today is empty and cheap.
  const [state, adminItems] = brewery.roles.includes("admin")
    ? await Promise.all([runCommand("get_first_run_state", {}, ctx) as Promise<FirstRun>, runCommand("get_today", {}, ctx) as Promise<TodayItem[]>])
    : [null, null];
  if (state && showFirstRun(state)) return <FirstRunChecklist brewery={brewery.name} state={state} />;
  if (onlyRoles(brewery.roles, ["taproom"])) {
    const locations = (await runCommand("list_locations", { use: "taproom" }, ctx)) as { id: string; name: string }[];
    const location = locations[0];
    if (!location) {
      return (
        <TodayView
          model={toTodayViewProps({ date, empty: { title: "No taproom location is available", description: "Ask Admin to add one under Locations." }, emptyVerb: "Taproom stock", rows: [] })}
          emptyAction={E.btn("Taproom stock", "g", "/beer")}
        />
      );
    }
    const [open, counts, report] = await Promise.all([
      runCommand("list_open_taps", { locationId: location.id }, ctx) as Promise<TapInterval[]>,
      runCommand("list_taproom_counts", { locationId: location.id }, ctx) as Promise<{ counted_on: string; created_at: string }[]>,
      runCommand("get_taproom_variance", { locationId: location.id, weeks: 4 }, ctx) as Promise<{ as_of: string; reason: string | null; rows: { variance_bbl: number | null }[]; periods: { coverage_complete: boolean; reason: string | null }[] }>,
    ]);
    return <TodayView model={toTodayViewProps({ date, taproom: taproomTodayRows(location, open, counts, report, brewery.timeZone) })} linkRows />;
  }
  const items = adminItems ?? (await runCommand("get_today", {}, ctx)) as TodayItem[];
  return <TodayView model={toTodayViewProps({ date, items, timeZone: brewery.timeZone, actions: todayActions(brewery.roles) })} linkRows />;
}
