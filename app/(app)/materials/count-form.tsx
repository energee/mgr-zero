"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useBrewery, useCommandContext } from "@/app/(app)/brewery-provider";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { CycleCountView, CycleCountFooter } from "@/components/mgr/views/cycle-count";
import { canRetireMaterialCountFailure, type MaterialCountPreview } from "@/lib/mgr/cycle-count-view";
import { E } from "@/components/mgr/e";
import { command, CommandResponseError } from "@/lib/commands/client";

type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };
type OnHand = { location_id: string; bin_id: string; qty: number };
type CountInput = { locationId: string; binId: string; revision: string; lines: { materialId: string; qty: number }[] };

export function CountForm({ materialId, materialName, uom, locations, bins, onHand }: {
  materialId: string; materialName: string; uom: string; locations: Location[]; bins: Bin[]; onHand: OnHand[];
}) {
  const formId = useId();
  const breweryId = useBrewery();
  const expectedContext = useRef(useCommandContext());
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const binsHere = bins.filter(bin => bin.location_id === locationId);
  const [binId, setBinId] = useState(binsHere[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [plan, setPlan] = useState<MaterialCountPreview | null>(null);
  const [phase, setPhase] = useState<"idle" | "previewing" | "ready" | "submitting" | "unknown">("idle");
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ requestId: string; input: CountInput } | null>(null);
  const locked = phase === "previewing" || phase === "submitting" || phase === "unknown";
  const invalid = !locationId || !binId || qty === "" || !Number.isFinite(Number(qty)) || Number(qty) < 0;
  const line = plan?.lines[0];
  const system = line?.qty_expected ?? Number(onHand.find(row => row.location_id === locationId && row.bin_id === binId)?.qty ?? 0);
  const variance = qty === "" ? null : Number(qty) - system;

  function clearPreview() { setPlan(null); setPhase("idle"); setError(null); }
  async function preview() {
    if (invalid || locked) return;
    setPhase("previewing"); setError(null); setPlan(null);
    try {
      setPlan(await command(breweryId, "get_material_count_preview", { locationId, binId, lines: [{ materialId, qty: Number(qty) }] }, undefined, expectedContext.current) as MaterialCountPreview);
      setPhase("ready");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not preview count"); setPhase("idle"); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); event.stopPropagation();
    if (phase !== "ready" && phase !== "unknown") return;
    const retrying = phase === "unknown";
    if (!attempt.current) {
      if (!plan || invalid) return;
      attempt.current = { requestId: crypto.randomUUID(), input: { locationId, binId, revision: plan.revision, lines: [{ materialId, qty: Number(qty) }] } };
    }
    const frozen = attempt.current;
    setPhase("submitting"); setError(null);
    try {
      await command(breweryId, "record_material_count", frozen.input, frozen.requestId, expectedContext.current);
      attempt.current = null; setOpen(false); setQty(""); clearPreview(); router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record count");
      if (cause instanceof CommandResponseError && canRetireMaterialCountFailure(cause.status, retrying, cause.code, cause.message)) {
        attempt.current = null; setPlan(null); setPhase("idle");
      } else setPhase("unknown");
    }
  }
  return <CommandForm open={open} onOpenChange={next => { if (!locked) { setOpen(next); setQty(""); clearPreview(); } }} title="Cycle count" trigger={<Button variant="ghost" size="sm">Count</Button>}
    footer={E.pin(<CycleCountFooter formId={formId} submitting={phase === "submitting"} retry={phase === "unknown"} disabled={phase !== "ready" && phase !== "unknown"} />)}>
    <form id={formId} onSubmit={submit} className="flex flex-col gap-3">
      <CycleCountView footer={null} model={{
        material: materialName, qty, units: [uom], unitIndex: 0, locationId, binId, locations, bins: binsHere,
        preview: `system ${system.toLocaleString("en-US", { maximumFractionDigits: 4 })}${variance === null ? "" : ` · variance ${variance > 0 ? "+" : ""}${variance.toLocaleString("en-US", { maximumFractionDigits: 4 })}`}${plan ? " · reviewed against current stock" : " · preview before recording"}`,
        adjustments: line?.adjustments.map(row => ({ key: row.lot_id ?? "untracked", lot: row.lot_code ?? "Untracked stock", expected: row.qty_expected, counted: row.qty_counted, delta: row.delta, unit: line.base_uom })),
      }} onQuantity={value => { setQty(value); clearPreview(); }} onBin={value => { setBinId(value); clearPreview(); }}
        onLocation={value => { setLocationId(value); setBinId(bins.find(bin => bin.location_id === value)?.id ?? ""); clearPreview(); }}
        onPreview={() => { void preview(); }} previewing={phase === "previewing"} frozen={phase === "unknown"} submitting={phase === "submitting"} disabled={invalid}
        messages={<CommandFormMessage error={error} />} />
    </form>
  </CommandForm>;
}
