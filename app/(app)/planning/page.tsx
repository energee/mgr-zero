// app/(app)/planning/page.tsx — More › Planning: material shortages only
// (get_material_requirements with shortOnly). Demand is planned or brewing
// batches, packaging runs, and uncovered orders; a row is what that demand
// needs beyond on hand and sent POs, resolved to a vendor, with the buy-by the
// view dated and whether it is already out of reach (the draft skips those).
// Because only shortages come back, an empty result says nothing about
// whether any work is scheduled; the empty state says so. Rows group by
// vendor, each group with its own draft-button.tsx (admin/warehouse, #1516).
import { PlanningView } from "@/components/mgr/views/planning";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toPlanningViewProps, type MaterialRequirementSnapshot } from "@/lib/mgr/planning-view";
import { breweryDate } from "@/lib/date-format";
import "@/lib/commands/all";
import { DraftButton } from "./draft-button";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/planning") };

export default async function PlanningPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const gaps = (await runCommand("get_material_requirements", { shortOnly: true }, ctx)) as MaterialRequirementSnapshot[];
  const canDraft = brewery.roles.includes("admin") || brewery.roles.includes("warehouse");

  return <PlanningView model={toPlanningViewProps({ requirements: gaps, today: breweryDate(brewery.timeZone), backHref: "/more", roles: brewery.roles })}
    groupAction={canDraft ? (group) => <DraftButton materialIds={group.draftIds} /> : null} />;
}
