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
import { runCommand } from "@/lib/commands/registry";
import type { TodayItem } from "@/lib/commands/today";
import "@/lib/commands/all";
import { FirstRunChecklist, type FirstRun } from "./first-run";

type Reason = TodayItem["reason"];
const VERB: Record<Reason, [string, "info" | "attention"]> = {
  submitted_order: ["Confirm", "info"], pick_due: ["Pick", "info"], restock_due: ["Put back", "attention"],
  delivery_next: ["Resume", "info"], fermentation_reading_overdue: ["Record", "info"], invoice_question: ["Answer", "info"],
};
const ICON: Record<TodayItem["subjectType"], typeof Package01Icon> = { order: Package01Icon, delivery: Route01Icon, occupancy: ThermometerIcon, invoice: Invoice01Icon };

export default async function TodayPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  if (brewery.role === "admin") {
    const state = (await runCommand("get_first_run_state", {}, ctx)) as FirstRun;
    if (!state.hasLocation && !state.hasBrand) return <FirstRunChecklist brewery={brewery.name} state={state} />;
  }
  const items = (await runCommand("get_today", {}, ctx)) as TodayItem[];
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "numeric", day: "numeric" }).format(new Date());
  return (
    <>
      {E.hd("Today", day)}
      {items.length === 0 ? (
        <>
          {E.blank("Nothing waiting")}
          {E.btn("Record movement", "g", "/inventory")}
        </>
      ) : items.map((it) => {
        const [verb, tone] = VERB[it.reason];
        return (
          <div key={`${it.reason}:${it.subjectId}`}>
            {E.row(it.safeLabel, it.detail, E.act(verb, tone, it.href), tone === "attention" || it.reason === "pick_due" ? "w" : "", ICON[it.subjectType])}
          </div>
        );
      })}
    </>
  );
}
