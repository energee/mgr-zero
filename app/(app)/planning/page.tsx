// app/(app)/planning/page.tsx — More › Planning: material shortages only
// (get_material_requirements with shortOnly). Demand is planned or brewing
// batches, packaging runs, and uncovered orders; a row is what that demand
// needs beyond on hand and sent POs, resolved to a vendor, with the buy-by the
// view dated and whether it is already out of reach (the draft skips those).
// Because only shortages come back, an empty result says nothing about
// whether any work is scheduled; the empty state says so. Rows group by
// vendor, each group with its own draft-button.tsx (admin/warehouse, #1516).
// Planned batches follow (list_release_batches), each marked Released once a
// portal release of it is open (list_releases), else offering Release for
// ordering to admin and sales (release-form.tsx).
import { PlanningView } from "@/components/mgr/views/planning";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toPlanningViewProps, type MaterialRequirementSnapshot } from "@/lib/mgr/planning-view";
import type { ReleaseBatchRow, ReleaseRow } from "@/lib/mgr/release-view";
import { ReleaseForm } from "../catalog/release-form";
import { breweryDate } from "@/lib/date-format";
import "@/lib/commands/all";
import { DraftButton } from "./draft-button";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/planning") };

export default async function PlanningPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [gaps, batches] = await Promise.all([
    runCommand("get_material_requirements", { shortOnly: true }, ctx) as Promise<MaterialRequirementSnapshot[]>,
    runCommand("list_release_batches", {}, ctx) as Promise<ReleaseBatchRow[]>,
  ]);
  const batchIds = [...new Set(batches.map((b) => b.batch_id))];
  const releases = batchIds.length ? await runCommand("list_releases", { batchIds }, ctx) as ReleaseRow[] : [];
  const canDraft = brewery.roles.includes("admin") || brewery.roles.includes("warehouse");

  return <PlanningView model={toPlanningViewProps({ requirements: gaps, batches, releases, today: breweryDate(brewery.timeZone), backHref: "/more", roles: brewery.roles })}
    groupAction={canDraft ? (group) => <DraftButton materialIds={group.draftIds} /> : null}
    releaseAction={(batch) => <ReleaseForm title={`Release for ordering · ${batch.title}`} forms={[batch.form]} />} />;
}
