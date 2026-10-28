// app/(app)/packaging/[id]/run-actions.tsx — the packaging run's next verb,
// by state: Start run (update_packaging_run stamping startedAt, with the source
// tank in the same call when none was picked at scheduling — starting needs a
// tank), or close it (close_packaging_run: actual outputs, lot, packaged date,
// and the finished-goods location + bin). Barrels drawn starts from the
// planned outputs' draw, and the finished-goods location and bin start on the
// only one; Close re-reads the material plan before it sends (#1508).
"use client";

import { PackagingSourcePicker, type PackagingSourceOccupancy as Occupancy } from "@/components/mgr/views/plan-actions";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { PackagingCloseFields } from "@/components/mgr/views/close-packaging-run";
import { emptyPackagingActual, packagingActualPayload, patchActual, removeActual, suggestedPackagingActuals, type PackagingClosePlan } from "@/lib/mgr/packaging-actuals";
import { useBrewery, useCommandContext } from "@/lib/brewery-provider";
import { command } from "@/lib/commands/client";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { finishedGoodsStart, onlyBinIn, packagingCloseReason } from "@/lib/mgr/close-packaging-run-view";
import { plannedDrawBbl } from "@/lib/mgr/schedule-packaging-run-view";

type Output = { id: string; sku_id: string; qty_planned: number; qty_actual: number | null; sku_name: string | null; whole: boolean; bbl_per_unit: number | null };
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };

export function PickAndStartForm({ runId, occupancies }: { runId: string; occupancies: Occupancy[] }) {
  const { busy, error, run } = useCommandAction();
  return <PackagingSourcePicker occupancies={occupancies} busy={busy} error={error}
    onPick={occupancyId => { void run("update_packaging_run", { runId, occupancyId, startedAt: new Date().toISOString() }); }} />;
}

export function StartRunButton({ runId }: { runId: string }) {
  const { busy, error, run } = useCommandAction();
  return (
    <div className="flex flex-col gap-2">
      <CommandFormMessage error={error} />
      <Button className="w-full md:w-fit" disabled={busy} onClick={() => run("update_packaging_run", { runId, startedAt: new Date().toISOString() })}>Start run</Button>
    </div>
  );
}

/** The binding supplies live state to the inventory's exact close controls. */
export function CloseRunForm({ runId, outputs, locations, bins, today, initialPlan }: { runId: string; outputs: Output[]; locations: Location[]; bins: Bin[]; today: string; initialPlan: PackagingClosePlan }) {
  const breweryId = useBrewery();
  const context = useCommandContext();
  const draw = plannedDrawBbl(outputs.map(row => ({ qty: row.qty_planned, bblPerUnit: row.bbl_per_unit ?? undefined })));
  // close_packaging_run records the draw to three decimals.
  const [fields, setFields] = useState({ bblDrawn: draw === undefined ? "" : String(Number(draw.toFixed(3))), lotCode: "", packagedOn: today, bestBy: "", ...finishedGoodsStart(locations, bins) });
  const [quantities, setQuantities] = useState(Object.fromEntries(outputs.map(row => [row.sku_id, String(row.qty_planned)])));
  const [plan, setPlan] = useState(initialPlan);
  const [actuals, setActuals] = useState(() => suggestedPackagingActuals(initialPlan));
  const { busy, blocked, pending, error, setError, run } = useCommandAction(runId);
  const [reviewing, setReviewing] = useState(false);
  const retry = pending?.name === "close_packaging_run" && !busy;
  const model = { ...fields, outputs: outputs.map(row => ({ id: row.sku_id, name: row.sku_name ?? row.sku_id, qty: quantities[row.sku_id], whole: row.whole })), plan, actuals, locations, bins };
  /** Re-read the material plan, then close against it. A plan that changed since the page loaded is shown instead of
   *  sent, so the actuals are reviewed against it first; close_packaging_run would refuse the old revision anyway. */
  async function reviewAndClose() {
    setReviewing(true); setError(null);
    let current: PackagingClosePlan;
    try { current = await command(breweryId, "get_packaging_close_plan", { runId }, undefined, context) as PackagingClosePlan; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not review material plan"); return; }
    finally { setReviewing(false); }
    if (current.revision !== plan.revision) {
      setPlan(current);
      setError("The material plan changed. Check the material actuals against it, then close again.");
      return;
    }
    void run("close_packaging_run", {
      runId, ...fields, bblDrawn: Number(fields.bblDrawn), bestBy: fields.bestBy || undefined,
      outputs: outputs.map(row => ({ skuId: row.sku_id, qtyActual: Number(quantities[row.sku_id]) })),
      planRevision: current.revision, actuals: packagingActualPayload(actuals),
    });
  }
  return <PackagingCloseFields model={model}
    disabled={busy || blocked || reviewing} retry={retry}
    onField={(field, value) => setFields(previous => ({ ...previous, [field]: value, ...(field === "locationId" ? { binId: onlyBinIn(bins, value) } : {}) }))}
    onOutput={(id, value) => setQuantities(previous => ({ ...previous, [id]: value }))}
    onActual={(key, patch) => setActuals(previous => patchActual(previous, key, patch))}
    onAdd={() => setActuals(previous => [...previous, emptyPackagingActual()])}
    onRemove={key => setActuals(previous => removeActual(previous, key))}
    onSubmit={() => {
      if (busy || reviewing) return;
      if (retry) { void run(pending.name, pending.input, undefined, { requestId: pending.requestId }); return; }
      if (blocked || packagingCloseReason(model)) return;
      void reviewAndClose();
    }}
    messages={<CommandFormMessage error={error} />} />;
}
