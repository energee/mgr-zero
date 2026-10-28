// app/(app)/materials/count-form.tsx — Cycle count for one material: starts
// on the bin holding the most of it (countDefaultBin), previews the count by
// itself once the quantity is valid, then Record count sends the previewed
// revision (#1507).
"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useBrewery, useCommandContext } from "@/lib/brewery-provider";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { CycleCountView, CycleCountFooter } from "@/components/mgr/views/cycle-count";
import { canRetireMaterialCountFailure, countDefaultBin, type MaterialCountPreview } from "@/lib/mgr/cycle-count-view";
import { E } from "@/components/mgr/e";
import { command, CommandResponseError } from "@/lib/commands/client";
import { submitReason } from "@/lib/mgr/submit-reason";

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
  const [start] = useState(() => countDefaultBin(onHand, locations, bins));
  const [locationId, setLocationId] = useState(start.locationId);
  const binsHere = bins.filter(bin => bin.location_id === locationId);
  const [binId, setBinId] = useState(start.binId);
  const [qty, setQty] = useState("");
  const [plan, setPlan] = useState<MaterialCountPreview | null>(null);
  const [phase, setPhase] = useState<"idle" | "previewing" | "ready" | "submitting" | "unknown">("idle");
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ requestId: string; input: CountInput } | null>(null);
  const locked = phase === "previewing" || phase === "submitting" || phase === "unknown";
  const previewReason = submitReason([
    ...(locationId ? [] : ["a location"]),
    ...(binId ? [] : ["a bin"]),
    ...(qty !== "" && Number.isFinite(Number(qty)) && Number(qty) >= 0 ? [] : ["a counted quantity of zero or more"]),
  ]);
  const line = plan?.lines[0];
  const system = line?.qty_expected ?? Number(onHand.find(row => row.location_id === locationId && row.bin_id === binId)?.qty ?? 0);
  const variance = qty === "" ? null : Number(qty) - system;

  function clearPreview() { setPlan(null); setPhase("idle"); setError(null); }
  // `current` says whether the fields are still the ones previewed; a stale
  // answer is dropped, since the quantity stays editable while it loads.
  async function preview(current: () => boolean = () => true) {
    if (previewReason || locked) return;
    setPhase("previewing"); setError(null); setPlan(null);
    try {
      const next = await command(breweryId, "get_material_count_preview", { locationId, binId, lines: [{ materialId, qty: Number(qty) }] }, undefined, expectedContext.current) as MaterialCountPreview;
      if (current()) { setPlan(next); setPhase("ready"); }
    } catch (cause) {
      if (current()) { setError(cause instanceof Error ? cause.message : "Could not preview count"); setPhase("idle"); }
    }
  }
  // Preview by itself a moment after the last change to a valid count. Every
  // field change also clears the previous preview (clearPreview).
  const previewable = open && !previewReason;
  useEffect(() => {
    if (!previewable) return;
    let live = true;
    const timer = setTimeout(() => { void preview(() => live); }, 400);
    return () => { live = false; clearTimeout(timer); };
    // preview reads these same fields; re-run only when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewable, locationId, binId, qty]);
  async function submit(event: FormEvent) {
    event.preventDefault(); event.stopPropagation();
    if (phase !== "ready" && phase !== "unknown") return;
    const retrying = phase === "unknown";
    if (!attempt.current) {
      if (!plan || previewReason) return;
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
        onPreview={() => { void preview(); }} previewing={phase === "previewing"} frozen={phase === "unknown"} submitting={phase === "submitting"} previewReason={previewReason}
        messages={<CommandFormMessage error={error} />} />
    </form>
  </CommandForm>;
}
