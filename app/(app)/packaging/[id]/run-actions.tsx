// app/(app)/packaging/[id]/run-actions.tsx — the packaging run's next verb,
// by state: pick the tank (update_packaging_run), start it (same command,
// stamped startedAt — both require a tank), or close it
// (close_packaging_run: actual outputs, lot, packaged date, and the
// finished-goods location + bin).
"use client";

import { PackagingSourcePicker, type PackagingSourceOccupancy as Occupancy } from "@/components/mgr/views/plan-actions";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { PackagingCloseFields } from "@/components/mgr/views/close-packaging-run";
import { emptyPackagingActual, packagingActualPayload, patchActual, removeActual, suggestedPackagingActuals, type PackagingClosePlan } from "@/lib/mgr/packaging-actuals";
import { useBrewery, useCommandContext } from "@/app/(app)/brewery-provider";
import { command } from "@/lib/commands/client";
import { useCommandAction, useRetainedCommand } from "@/lib/commands/use-command-form";
import { packagingCloseReady } from "@/lib/mgr/close-packaging-run-view";

type Output = { id: string; sku_id: string; qty_planned: number; qty_actual: number | null; sku_name: string | null };
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };

export function PickTankForm({ runId, occupancies }: { runId: string; occupancies: Occupancy[] }) {
  const { busy, error, run } = useCommandAction();
  return <PackagingSourcePicker occupancies={occupancies} busy={busy} error={error}
    onPick={occupancyId => { void run("update_packaging_run", { runId, occupancyId }); }} />;
}

export function StartRunButton({ runId }: { runId: string }) {
  const { busy, error, run } = useCommandAction();
  return (
    <div className="flex flex-col gap-2">
      <CommandFormMessage error={error} />
      <Button className="w-full md:w-fit" disabled={busy} onClick={() => run("update_packaging_run", { runId, startedAt: new Date().toISOString() })}>Start</Button>
    </div>
  );
}

/** The binding supplies live state to the inventory's exact close controls. */
export function CloseRunForm({ runId, outputs, locations, bins, today, initialPlan }: { runId: string; outputs: Output[]; locations: Location[]; bins: Bin[]; today: string; initialPlan: PackagingClosePlan }) {
  const breweryId = useBrewery();
  const context = useCommandContext();
  const [fields, setFields] = useState({ bblDrawn: "", lotCode: "", packagedOn: today, bestBy: "", locationId: "", binId: "" });
  const [quantities, setQuantities] = useState(Object.fromEntries(outputs.map(row => [row.sku_id, String(row.qty_planned)])));
  const [plan, setPlan] = useState(initialPlan);
  const [actuals, setActuals] = useState(() => suggestedPackagingActuals(initialPlan));
  // A stale plan is a definitive refusal even on a retry: nothing was written.
  const { phase, setPhase, error, setError, submit } = useRetainedCommand("close_packaging_run", { fallback: "Could not close packaging run", retire: cause => cause.code === "stale_plan" });
  const model = { ...fields, outputs: outputs.map(row => ({ id: row.sku_id, name: row.sku_name ?? row.sku_id, qty: quantities[row.sku_id] })), plan, actuals, locations, bins };
  const ready = packagingCloseReady(model);
  async function refreshPlan() {
    if (phase !== "idle") return;
    setPhase("busy"); setError(null);
    try { setPlan(await command(breweryId, "get_packaging_close_plan", { runId }, undefined, context) as PackagingClosePlan); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not review material plan"); }
    finally { setPhase("idle"); }
  }
  return <PackagingCloseFields model={model}
    disabled={phase !== "idle"} retry={phase === "unknown"} ready={ready || phase === "unknown"}
    onField={(field, value) => setFields(previous => ({ ...previous, [field]: value, ...(field === "locationId" ? { binId: "" } : {}) }))}
    onOutput={(id, value) => setQuantities(previous => ({ ...previous, [id]: value }))}
    onActual={(key, patch) => setActuals(previous => patchActual(previous, key, patch))}
    onAdd={() => setActuals(previous => [...previous, emptyPackagingActual()])}
    onRemove={key => setActuals(previous => removeActual(previous, key))}
    onSubmit={() => { if (ready || phase === "unknown") void submit(() => ({
      runId, ...fields, bblDrawn: Number(fields.bblDrawn), bestBy: fields.bestBy || undefined,
      outputs: outputs.map(row => ({ skuId: row.sku_id, qtyActual: Number(quantities[row.sku_id]) })),
      planRevision: plan.revision, actuals: packagingActualPayload(actuals),
    })); }}
    onRefresh={() => { void refreshPlan(); }} messages={<CommandFormMessage error={error} />} />;
}
