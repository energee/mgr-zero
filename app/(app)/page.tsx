// app/(app)/page.tsx — Today: the role-filtered work list from get_today,
// drawn to the Today screen record (components/mgr/screens.tsx) in the E
// vocabulary. The row verb is the action and opens the item's href; the
// empty state offers the role's first verb. An admin on a brewery with no
// location and no brand sees the First-run checklist (first-run.tsx) instead.
// Screens stay fixtures: nothing here imports SCREENS.
import { E } from "@/components/mgr/e";
import { TodayView } from "@/components/mgr/views/today";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import type { TodayItem } from "@/lib/commands/today";
import { toTodayViewProps } from "@/lib/mgr/today-view";
import "@/lib/commands/all";
import { FirstRunChecklist, type FirstRun } from "./first-run";
import { taproomTodayRows } from "@/lib/mgr/taproom-today";
import type { TapInterval } from "@/lib/mgr/tap-board-state";

export default async function TodayPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const date = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "numeric", day: "numeric" }).format(new Date());
  if (brewery.role === "admin") {
    const state = (await runCommand("get_first_run_state", {}, ctx)) as FirstRun;
    if (!state.hasLocation && !state.hasBrand) return <FirstRunChecklist brewery={brewery.name} state={state} />;
  }
  if (brewery.role === "taproom") {
    const locations = ((await runCommand("list_locations", {}, ctx)) as { id: string; name: string; kind: string }[]).filter((location) => location.kind === "taproom");
    const location = locations[0];
    if (!location) {
      return (
        <TodayView
          model={toTodayViewProps({ date, empty: "No taproom location is available", emptyVerb: "Taproom stock", rows: [] })}
          emptyAction={E.btn("Taproom stock", "g", "/beer")}
        />
      );
    }
    const [open, counts, report] = await Promise.all([
      runCommand("list_open_taps", { locationId: location.id }, ctx) as Promise<TapInterval[]>,
      runCommand("list_taproom_counts", { locationId: location.id }, ctx) as Promise<{ counted_on: string; created_at: string }[]>,
      runCommand("get_taproom_variance", { locationId: location.id, weeks: 4 }, ctx) as Promise<{ as_of: string; reason: string | null; rows: { variance_bbl: number | null }[]; periods: { coverage_complete: boolean; reason: string | null }[] }>,
    ]);
    return <TodayView model={toTodayViewProps({ date, taproom: taproomTodayRows(location, open, counts, report) })} linkRows />;
  }
  const items = (await runCommand("get_today", {}, ctx)) as TodayItem[];
  return (
    <TodayView
      model={toTodayViewProps({ date, items, empty: "Nothing waiting", emptyVerb: "Record movement" })}
      emptyAction={E.btn("Record movement", "g", "/inventory?recordMovement=1")}
      linkRows
    />
  );
}
