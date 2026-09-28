// Existing output/tank tests now confirm explicit material quantities. This
// fixture chooses the BOM quantities for their actual outputs; production
// commands never synthesize operator confirmation.
import { runCommand, type Ctx, type CommandExecution } from "@/lib/commands/registry";
import { suggestedPackagingActuals, type PackagingClosePlan } from "@/lib/mgr/packaging-actuals";

type CloseInput = { runId: string; outputs: { skuId: string; qtyActual: number }[]; locationId: string; binId: string; [key: string]: unknown };
export async function closeWithConfirmedMaterials(input: CloseInput, ctx: Ctx, execution?: CommandExecution) {
  const plan = await runCommand("get_packaging_close_plan", { runId: input.runId }, ctx) as Omit<PackagingClosePlan, "planned"> & {
    planned: (PackagingClosePlan["planned"][number] & { bom: { skuId: string; qtyPerUnit: number }[] })[];
  };
  const planned = plan.planned.map(row => ({ ...row, qty: row.bom.reduce((total, bom) => {
    const amount = (input.outputs.find(output => output.skuId === bom.skuId)?.qtyActual ?? 0) * bom.qtyPerUnit;
    return total + (row.unit === "each" ? Math.ceil(amount) : amount);
  }, 0) }));
  const rows = suggestedPackagingActuals({ planned, sources: plan.sources.filter(source => source.locationId === input.locationId && source.binId === input.binId) });
  return runCommand("close_packaging_run", { ...input, planRevision: plan.revision, actuals: rows.map(row => ({
    materialId: row.materialId, locationId: row.locationId || input.locationId, binId: row.binId || input.binId, lotId: row.lotId,
    used: Number(row.used), loss: 0, unused: 0,
  })) }, ctx, execution);
}
