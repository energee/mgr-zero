// app/(app)/planning/page.tsx — More › Planning: material gaps
// (get_material_requirements): what committed batches and packaging runs
// need, less on hand and open POs, resolved to a vendor, with the buy-by the
// view dated and whether it is already out of reach (the RPC skips those).
// Draft is draft-button.tsx (admin/warehouse).
import { PlanningView } from "@/components/mgr/views/planning";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toPlanningViewProps, type MaterialRequirementSnapshot } from "@/lib/mgr/planning-view";
import "@/lib/commands/all";
import { DraftButton } from "./draft-button";

export default async function PlanningPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const gaps = ((await runCommand("get_material_requirements", {}, ctx)) as MaterialRequirementSnapshot[]).filter((g) => g.short > 0);
  const buyable = gaps.filter((g) => g.vendor_id && !g.out_of_reach);
  const vendors = new Set(buyable.map((g) => g.vendor_id));
  const canDraft = brewery.role === "admin" || brewery.role === "warehouse";

  return <PlanningView model={toPlanningViewProps({ requirements: gaps })}
    footer={canDraft ? <DraftButton materialIds={buyable.map((g) => g.material_id)} vendorCount={vendors.size} /> : null} />;
}
