// app/(app)/packaging/[id]/material-correction.tsx — binds the shared
// material-correction view to correct_packaging_material_record.
"use client";

import { useState } from "react";
import { PackagingMaterialCorrection } from "@/components/mgr/views/packaging-materials";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { emptyPackagingActual, packagingActualPayload, packagingCorrectionPlan, packagingCorrectionReady, patchActual, removeActual, type PackagingActualDraft, type PackagingClosePlan, type PackagingMaterialRecord } from "@/lib/mgr/packaging-actuals";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function MaterialCorrection({ runId, record, plan, locations, bins }: { runId: string; record: PackagingMaterialRecord; plan: PackagingClosePlan; locations: { id: string; name: string }[]; bins: { id: string; location_id: string; name: string }[] }) {
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<PackagingActualDraft[]>(() => record.actuals.map((row, index) => ({ key: String(index), materialId: row.material_id, locationId: row.location_id, binId: row.bin_id, lotId: row.lot_id, used: String(row.qty_used), loss: String(row.qty_loss), unused: String(row.qty_unused) })));
  const { busy, blocked, pending, error, run } = useCommandAction(runId);
  const retry = pending?.name === "correct_packaging_material_record" && !busy;
  const restored = packagingCorrectionPlan(plan, record);
  const ready = packagingCorrectionReady(reason, rows, restored);
  return <PackagingMaterialCorrection plan={restored} rows={rows} locations={locations} bins={bins} reason={reason} disabled={busy || blocked} retry={retry} ready={ready || retry}
    onReason={setReason} onChange={(key, patch) => setRows(previous => patchActual(previous, key, patch))}
    onAdd={() => setRows(previous => [...previous, emptyPackagingActual()])}
    onRemove={key => setRows(previous => removeActual(previous, key))}
    onSubmit={() => {
      if (busy) return;
      if (retry) { void run(pending.name, pending.input, undefined, { requestId: pending.requestId }); return; }
      if (!blocked && ready) void run("correct_packaging_material_record", { recordId: record.id, reason, actuals: packagingActualPayload(rows) });
    }}
    messages={<CommandFormMessage error={error} />} />;
}
