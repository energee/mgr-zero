// app/(app)/page.tsx — Today: the role-filtered work list from get_today,
// drawn to the Today screen record (components/mgr/screens.tsx) in the E
// vocabulary. The row verb is the action and opens the item's href; the
// empty state offers the role's first verb. An admin on a brewery with no
// location and no brand sees the First-run checklist (first-run.tsx) instead.
// Screens stay fixtures: nothing here imports SCREENS.
import { Invoice01Icon, Package01Icon, Route01Icon, ThermometerIcon } from "@hugeicons/core-free-icons";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { TODAY_VERB } from "@/lib/commands/landings";
import type { TodayItem } from "@/lib/commands/today";
import "@/lib/commands/all";
import { FirstRunChecklist, type FirstRun } from "./first-run";
import { taproomTodayRows } from "@/lib/mgr/taproom-today";
import type { TapInterval } from "@/lib/mgr/tap-board-state";

const ICON: Record<TodayItem["subjectType"], typeof Package01Icon> = { order: Package01Icon, delivery: Route01Icon, occupancy: ThermometerIcon, invoice: Invoice01Icon };

export default async function TodayPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "numeric", day: "numeric" }).format(new Date());
  if (brewery.role === "admin") {
    const state = (await runCommand("get_first_run_state", {}, ctx)) as FirstRun;
    if (!state.hasLocation && !state.hasBrand) return <FirstRunChecklist brewery={brewery.name} state={state} />;
  }
  if (brewery.role === "taproom") {
    const locations = ((await runCommand("list_locations", {}, ctx)) as { id: string; name: string; kind: string }[]).filter((location) => location.kind === "taproom");
    const location = locations[0];
    if (!location) return <>{E.hd("Today", day)}{E.blank("No taproom location is available")}{E.btn("Taproom stock", "g", "/beer")}</>;
    const [open, counts, report] = await Promise.all([
      runCommand("list_open_taps", { locationId: location.id }, ctx) as Promise<TapInterval[]>,
      runCommand("list_taproom_counts", { locationId: location.id }, ctx) as Promise<{ counted_on: string; created_at: string }[]>,
      runCommand("get_taproom_variance", { locationId: location.id, weeks: 4 }, ctx) as Promise<{ as_of: string; reason: string | null; rows: { variance_bbl: number | null }[] }>,
    ]);
    return <>{E.hd("Today", day)}{taproomTodayRows(location, open, counts, report).map((row) => <div key={row.href}>{E.row(row.label, row.detail, E.act(row.verb, "info", row.href))}</div>)}</>;
  }
  const items = (await runCommand("get_today", {}, ctx)) as TodayItem[];
  return (
    <>
      {E.hd("Today", day)}
      {items.length === 0 ? (
        <>
          {E.blank("Nothing waiting")}
          {E.btn("Record movement", "g", "/inventory")}
        </>
      ) : items.map((it) => {
        const [verb, tone] = TODAY_VERB[it.reason];
        return (
          <div key={`${it.reason}:${it.subjectId}`}>
            {E.row(it.safeLabel, it.detail, E.act(verb, tone, it.href), tone === "attention" || it.reason === "pick_due" ? "w" : "", ICON[it.subjectType])}
          </div>
        );
      })}
    </>
  );
}
