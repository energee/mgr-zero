"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBrewery, useCommandContext } from "@/app/(app)/brewery-provider";
import { PackagingMaterialCorrection } from "@/components/mgr/views/packaging-materials";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { packagingCorrectionPlan, packagingActualsReady, type PackagingActualDraft, type PackagingClosePlan, type PackagingMaterialRecord } from "@/lib/mgr/packaging-actuals";
import { command, CommandResponseError } from "@/lib/commands/client";
import { canRetireCommandFailure } from "@/lib/commands/failure";

export function MaterialCorrection({ record, plan, locations, bins }: { record: PackagingMaterialRecord; plan: PackagingClosePlan; locations: { id: string; name: string }[]; bins: { id: string; location_id: string; name: string }[] }) {
  const breweryId = useBrewery(); const context = useCommandContext(); const router = useRouter();
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<PackagingActualDraft[]>(() => record.actuals.map((row,index) => ({ key: String(index), materialId: row.material_id, locationId: row.location_id, binId: row.bin_id, lotId: row.lot_id, used: String(row.qty_used), loss: String(row.qty_loss), unused: String(row.qty_unused) })));
  const [phase, setPhase] = useState<"idle" | "busy" | "unknown">("idle"); const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ id: string; input: unknown; context: typeof context } | null>(null);
  const ready = reason.trim() !== "" && packagingActualsReady(rows, plan.materials, record.planned.map(row => row.materialId));
  async function save() {
    if (phase === "busy" || (!ready && phase !== "unknown")) return;
    const retrying = phase === "unknown";
    if (!attempt.current) attempt.current = { id: crypto.randomUUID(), context, input: { recordId: record.id, reason, actuals: rows.map(row => ({ materialId: row.materialId, locationId: row.locationId, binId: row.binId, lotId: row.lotId, used: Number(row.used), loss: Number(row.loss), unused: Number(row.unused) })) } };
    setPhase("busy"); setError(null);
    try { await command(breweryId, "correct_packaging_material_record", attempt.current.input, attempt.current.id, attempt.current.context); attempt.current = null; setPhase("idle"); router.refresh(); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not correct materials");
      if (cause instanceof CommandResponseError && canRetireCommandFailure(cause.status,retrying,cause.code)) { attempt.current=null; setPhase("idle"); } else setPhase("unknown");
    }
  }
  return <PackagingMaterialCorrection plan={packagingCorrectionPlan(plan, record)} rows={rows} locations={locations} bins={bins} reason={reason} disabled={phase !== "idle"} retry={phase === "unknown"} ready={ready || phase === "unknown"}
    onReason={setReason} onChange={(key,patch)=>setRows(previous=>previous.map(row=>row.key===key?{...row,...patch}:row))}
    onAdd={()=>setRows(previous=>[...previous,{key:crypto.randomUUID(),materialId:"",locationId:"",binId:"",lotId:null,used:"0",loss:"0",unused:"0"}])}
    onRemove={key=>setRows(previous=>previous.filter(row=>row.key!==key))} onSubmit={()=>{void save();}} messages={<CommandFormMessage error={error} />} />;
}
