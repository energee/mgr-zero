// app/(app)/cellar/occupancy-actions.tsx — the cellar verbs for one open
// occupancy (Reading, Transfer, Addition, Complete batch), mounted on Vessel
// detail and a recorded batch's page so neither sends the brewer back to
// Cellar to pick the tank again (#1508). Each sheet opens on this occupancy;
// the cellar map mounts the same forms with no tank chosen.
import { E } from "@/components/mgr/e";
import { runPageQuery } from "@/lib/mgr/page-query";
import type { Ctx } from "@/lib/commands/registry";
import type { AdditionLot, AdditionMaterial } from "@/lib/mgr/cellar-addition-view";
import type { TransferOccupancy, TransferVessel } from "@/lib/mgr/cellar-transfer-view";
import { CellarTransferForm } from "./cellar-transfer-form";
import { CellarAdditionForm } from "./cellar-addition-form";
import { BatchCompletionForm } from "./batch-completion-form";

/** The Addition sheet's choices: the five material fields it reads (not the whole row), and lots grouped by material. */
export function additionChoices(materials: AdditionMaterial[], lots: (AdditionLot & { material_id: string })[]) {
  const lotsByMaterial: Record<string, AdditionLot[]> = {};
  for (const lot of lots) (lotsByMaterial[lot.material_id] ??= []).push(lot);
  return { materials: materials.map(({ id, name, category, base_uom, lot_tracked }) => ({ id, name, category, base_uom, lot_tracked })), lotsByMaterial };
}

/** `readingHref` draws Reading, outline beside the batch page's own primary; Vessel detail leaves it out because its view already has one. */
export async function OccupancyActions({ ctx, occupancyId, batch, readingHref }: {
  ctx: Ctx; occupancyId: string; batch: { id: string; label: string }; readingHref?: string;
}) {
  const [occupancies, vessels, materials, lots] = await Promise.all([
    runPageQuery("list_occupancies", {}, ctx), runPageQuery("list_vessels", {}, ctx),
    runPageQuery("list_materials", {}, ctx), runPageQuery("list_material_lots", {}, ctx),
  ]) as [TransferOccupancy[], TransferVessel[], AdditionMaterial[], (AdditionLot & { material_id: string })[]];
  const choices = additionChoices(materials, lots);
  return <div className="flex flex-wrap gap-2">
    {readingHref && E.btn("Reading", "g", readingHref)}
    <CellarTransferForm occupancies={occupancies} vessels={vessels} fromId={occupancyId} />
    <CellarAdditionForm occupancies={occupancies} materials={choices.materials} lotsByMaterial={choices.lotsByMaterial} occupancyId={occupancyId} />
    <BatchCompletionForm batches={[batch]} />
  </div>;
}
