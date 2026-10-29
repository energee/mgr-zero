// app/(app)/materials/count-form.tsx — a material count at one bin. A row's
// Count opens Cycle count for its one material; Count sheet (`sheet`) lists
// every material on the page held in the chosen bin (#1583). The count starts
// on the bin holding the most stock (countDefaultBin), previews every counted
// line by itself once the counts are valid, then Record count sends the
// previewed revision with those same lines (#1507).
"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useBrewery, useCommandContext } from "@/lib/brewery-provider";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { CycleCountView, CycleCountFooter } from "@/components/mgr/views/cycle-count";
import { canRetireMaterialCountFailure, countDefaultBin, countLines, countLineView, materialsHeldAt, type MaterialCountPreview } from "@/lib/mgr/cycle-count-view";
import { E } from "@/components/mgr/e";
import { command, CommandResponseError } from "@/lib/commands/client";
import { submitReason } from "@/lib/mgr/submit-reason";

type Material = { id: string; name: string; uom: string };
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };
type OnHand = { material_id: string; location_id: string; bin_id: string; qty: number };
type CountInput = { locationId: string; binId: string; revision: string; lines: { materialId: string; qty: number }[] };

/** Without `sheet`, `materials` is the one material a row's Count counts, at
 *  any bin. With it, the form lists only those of `materials` held in the
 *  chosen bin. `onHand` is get_material_on_hand's rows for `materials`. */
export function CountForm({ materials, sheet = false, locations, bins, onHand }: {
  materials: Material[]; sheet?: boolean; locations: Location[]; bins: Bin[]; onHand: OnHand[];
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
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<MaterialCountPreview | null>(null);
  const [phase, setPhase] = useState<"idle" | "previewing" | "ready" | "submitting" | "unknown">("idle");
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ requestId: string; input: CountInput } | null>(null);
  const locked = phase === "previewing" || phase === "submitting" || phase === "unknown";
  const listed = sheet ? materialsHeldAt(materials, onHand, locationId, binId) : materials;
  const lines = countLines(listed, counts);
  // The effect below keys on this value, not on the array rebuilt each render.
  const linesKey = JSON.stringify(lines);
  const previewReason = submitReason([
    ...(locationId ? [] : ["a location"]),
    ...(binId ? [] : ["a bin"]),
    ...(lines ? [] : ["a counted quantity of zero or more"]),
  ]);

  function clearPreview() { setPlan(null); setPhase("idle"); setError(null); }
  // `current` says whether the fields are still the ones previewed; a stale
  // answer is dropped, since the quantities stay editable while it loads.
  async function preview(current: () => boolean = () => true) {
    if (previewReason || locked || !lines) return;
    setPhase("previewing"); setError(null); setPlan(null);
    try {
      const next = await command(breweryId, "get_material_count_preview", { locationId, binId, lines }, undefined, expectedContext.current) as MaterialCountPreview;
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
  }, [previewable, locationId, binId, linesKey]);
  async function submit(event: FormEvent) {
    event.preventDefault(); event.stopPropagation();
    if (phase !== "ready" && phase !== "unknown") return;
    const retrying = phase === "unknown";
    if (!attempt.current) {
      if (!plan || previewReason || !lines) return;
      attempt.current = { requestId: crypto.randomUUID(), input: { locationId, binId, revision: plan.revision, lines } };
    }
    const frozen = attempt.current;
    setPhase("submitting"); setError(null);
    try {
      await command(breweryId, "record_material_count", frozen.input, frozen.requestId, expectedContext.current);
      attempt.current = null; setOpen(false); setCounts({}); clearPreview(); router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record count");
      if (cause instanceof CommandResponseError && canRetireMaterialCountFailure(cause.status, retrying, cause.code, cause.message)) {
        attempt.current = null; setPlan(null); setPhase("idle");
      } else setPhase("unknown");
    }
  }
  const binQty = (materialId: string) => Number(onHand.find(row => row.material_id === materialId && row.location_id === locationId && row.bin_id === binId)?.qty ?? 0);
  return <CommandForm open={open} onOpenChange={next => { if (!locked) { setOpen(next); setCounts({}); clearPreview(); } }} title={sheet ? "Count sheet" : "Cycle count"}
    trigger={sheet ? <Button variant="outline" size="sm">Count sheet</Button> : <Button variant="ghost" size="sm">Count</Button>}
    footer={E.pin(<CycleCountFooter formId={formId} submitting={phase === "submitting"} retry={phase === "unknown"} disabled={phase !== "ready" && phase !== "unknown"} />)}>
    <form id={formId} onSubmit={submit} className="flex flex-col gap-3">
      <CycleCountView footer={null} model={{
        locationId, binId, locations, bins: binsHere,
        lines: listed.map(material => countLineView(material, counts[material.id] ?? "", binQty(material.id), plan)),
        empty: listed.length ? undefined : "No material on this list has stock in this bin.",
      }} onQuantity={(key, value) => { setCounts(current => ({ ...current, [key]: value })); clearPreview(); }} onBin={value => { setBinId(value); clearPreview(); }}
        onLocation={value => { setLocationId(value); setBinId(bins.find(bin => bin.location_id === value)?.id ?? ""); clearPreview(); }}
        onPreview={() => { void preview(); }} previewing={phase === "previewing"} frozen={phase === "unknown"} submitting={phase === "submitting"} previewReason={previewReason}
        messages={<CommandFormMessage error={error} />} />
    </form>
  </CommandForm>;
}
