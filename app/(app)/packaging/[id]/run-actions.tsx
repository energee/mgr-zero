// app/(app)/packaging/[id]/run-actions.tsx — the packaging run's next verb,
// by state: pick the tank (update_packaging_run), start it (same command,
// stamped startedAt — both require a tank), or close it
// (close_packaging_run: actual outputs, lot, packaged date, and the
// finished-goods location + bin).
"use client";

import { PackagingSource, type PackagingSourceOccupancy as Occupancy } from "@/components/mgr/views/plan-actions";
import { useRef, useState } from "react";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { PackagingCloseFields } from "@/components/mgr/views/close-packaging-run";
import { packagingActualsReady, suggestedPackagingActuals, type PackagingClosePlan } from "@/lib/mgr/packaging-actuals";
import { useBrewery, useCommandContext } from "@/app/(app)/brewery-provider";
import { useRouter } from "next/navigation";
import { command, CommandResponseError } from "@/lib/commands/client";
import { canRetireCommandFailure } from "@/lib/commands/failure";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { closeRunReady } from "@/lib/mgr/close-packaging-run-view";

type Output = { id: string; sku_id: string; qty_planned: number; qty_actual: number | null; sku_name: string | null };
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };

export function PickTankForm({ runId, occupancies }: { runId: string; occupancies: Occupancy[] }) {
  const { busy, error, run } = useCommandAction();
  return <PackagingSource occupancies={occupancies} busy={busy} error={error}
    onPick={occupancyId => { void run("update_packaging_run", { runId, occupancyId }); }} />;
}

export function StartRunButton({ runId }: { runId: string }) {
  const { busy, error, run } = useCommandAction();
  return <PackagingSource sourcePicked busy={busy} error={error}
    onStart={() => { void run("update_packaging_run", { runId, startedAt: new Date().toISOString() }); }} />;
}

/** The binding supplies live state to the inventory's exact close controls. */
export function CloseRunForm({ runId, outputs, locations, bins, today, initialPlan }: { runId: string; outputs: Output[]; locations: Location[]; bins: Bin[]; today: string; initialPlan: PackagingClosePlan }) {
  const breweryId = useBrewery();
  const context = useCommandContext();
  const router = useRouter();
  const [fields, setFields] = useState({ bblDrawn: "", lotCode: "", packagedOn: today, bestBy: "", locationId: "", binId: "" });
  const [quantities, setQuantities] = useState(Object.fromEntries(outputs.map(row => [row.sku_id, String(row.qty_planned)])));
  const [plan, setPlan] = useState(initialPlan);
  const [actuals, setActuals] = useState(() => suggestedPackagingActuals(initialPlan));
  const [phase, setPhase] = useState<"idle" | "busy" | "unknown">("idle");
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ requestId: string; input: unknown; context: typeof context } | null>(null);
  const ready = closeRunReady({ ...fields, actuals: quantities }) && packagingActualsReady(actuals, plan.materials, plan.planned.map(row => row.materialId));
  async function submit() {
    if (phase === "busy" || (!ready && phase !== "unknown")) return;
    const retrying = phase === "unknown";
    if (!attempt.current) attempt.current = { requestId: crypto.randomUUID(), context, input: {
      runId, ...fields, bblDrawn: Number(fields.bblDrawn), bestBy: fields.bestBy || undefined,
      outputs: outputs.map(row => ({ skuId: row.sku_id, qtyActual: Number(quantities[row.sku_id]) })),
      planRevision: plan.revision, actuals: actuals.map(row => ({ materialId: row.materialId, locationId: row.locationId, binId: row.binId, lotId: row.lotId, used: Number(row.used), loss: Number(row.loss), unused: Number(row.unused) })),
    } };
    setPhase("busy"); setError(null);
    try {
      await command(breweryId, "close_packaging_run", attempt.current.input, attempt.current.requestId, attempt.current.context);
      attempt.current = null; setPhase("idle"); router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not close packaging run");
      const stale = cause instanceof CommandResponseError && cause.status === 409 && cause.code === "conflict" && cause.message === "Packaging material plan changed. Review it again.";
      if (cause instanceof CommandResponseError && (stale || canRetireCommandFailure(cause.status, retrying, cause.code))) { attempt.current = null; setPhase("idle"); }
      else setPhase("unknown");
    }
  }
  async function refreshPlan() {
    if (phase !== "idle") return;
    setPhase("busy"); setError(null);
    try { setPlan(await command(breweryId, "get_packaging_close_plan", { runId }, undefined, context) as PackagingClosePlan); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not review material plan"); }
    finally { setPhase("idle"); }
  }
  return <PackagingCloseFields model={{ ...fields, outputs: outputs.map(row => ({ id: row.sku_id, name: row.sku_name ?? row.sku_id, qty: quantities[row.sku_id] })), plan, actuals, locations, bins }}
    disabled={phase !== "idle"} retry={phase === "unknown"} ready={ready || phase === "unknown"}
    onField={(field, value) => setFields(previous => ({ ...previous, [field]: value, ...(field === "locationId" ? { binId: "" } : {}) }))}
    onOutput={(id, value) => setQuantities(previous => ({ ...previous, [id]: value }))}
    onActual={(key, patch) => setActuals(previous => previous.map(row => row.key === key ? { ...row, ...patch } : row))}
    onAdd={() => setActuals(previous => [...previous, { key: crypto.randomUUID(), materialId: "", locationId: "", binId: "", lotId: null, used: "0", loss: "0", unused: "0" }])}
    onRemove={key => setActuals(previous => previous.filter(row => row.key !== key))}
    onSubmit={() => { void submit(); }} onRefresh={() => { void refreshPlan(); }} messages={<CommandFormMessage error={error} />} />;
}
