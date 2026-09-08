// app/(app)/invoices/[id]/credit-memo-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the
// return_shipment command (screen record Return and credit): qty per invoice
// line to return (0 = skip), a return-to location, and the reason, which
// decides the beer and never the money: unsold and wrong item come back
// sellable, damaged comes back and is written to loss in the same call.
// The credit is always at the price frozen on the invoice line.
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

import { command } from "@/lib/commands/client";
import { useBrewery } from "../../brewery-provider";
import type { ReturnSource } from "@/lib/commands/orders";

type Line = { id: string; skuId: string; label: string; qty: number };

export function buildReturnLines(lines: Line[], qtys: Record<string, string>, sources: ReturnSource[], sourceQtys: Record<string, string>, binId: string, shipmentId: string | null) {
  return lines.filter(l => Number(qtys[l.id] ?? 0) > 0).map(l => ({
    invoiceLineId: l.id,
    qty: Number(qtys[l.id]),
    ...(shipmentId === null ? {} : {
      sources: sources.filter(s => s.sku_id === l.skuId && Number(sourceQtys[s.id]) > 0)
        .map(s => ({ movementId: s.id, binId, qty: Number(sourceQtys[s.id]) })),
    }),
  }));
}

export function CreditMemoForm({
  invoiceId,
  shipmentId,
  lines,
  locations,
}: {
  invoiceId: string;
  shipmentId: string | null;
  lines: Line[];
  locations: { id: string; name: string }[];
}) {
  const breweryId = useBrewery();
  const [sources, setSources] = useState<ReturnSource[]>([]);
  const [bins, setBins] = useState<{ id: string; name: string; location_id: string }[]>([]);
  const [sourceQtys, setSourceQtys] = useState<Record<string, string>>({});
  const [binId, setBinId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [locationId, setLocationId] = useState("");
  const [reason, setReason] = useState("");

  function reset() {
    setQtys({}); setSourceQtys({}); setBinId("");
    setLocationId("");
    setReason("");
  }

  const form = useCommandForm("return_shipment", {
    build: () => ({
      invoiceId,
      locationId,
      reason,
      lines: buildReturnLines(lines, qtys, sources, sourceQtys, binId, shipmentId),
    }),
    reset,
  });

  useEffect(() => {
    if (!form.open) return;
    let live = true;
    Promise.all([command(breweryId, "get_invoice_return_sources", { invoiceId }), command(breweryId, "list_bins", {})]).then(([s, b]) => {
      if (live) { setSources(s as ReturnSource[]); setBins(b as typeof bins); setLoadError(null); }
    }).catch(err => { if (live) setLoadError(String(err)); });
    return () => { live = false; };
  }, [form.open, breweryId, invoiceId]);
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Return shipment" trigger={<Button size="sm" variant="outline">
          Return
        </Button>}>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Lines returning</Label>
            {lines.map((l) => (
              <div key={l.id} className="flex flex-col gap-2 border-b pb-3">
                <Label className="flex-1 font-normal">
                  {l.label} (invoiced {l.qty})
                </Label>
                <Input
                  type="number"
                  min="0"
                  max={l.qty}
                  step="0.01"
                  className="w-24"
                  placeholder="0"
                  value={qtys[l.id] ?? ""}
                  onChange={(e) => setQtys((prev) => ({ ...prev, [l.id]: e.target.value }))}
                />
                {sources.filter(s => s.sku_id === l.skuId).map(s => <Label key={s.id} className="flex flex-col gap-2">{s.lots?.code ?? "Untracked / legacy stock"} · shipped from {s.bins?.name} ({-Number(s.qty)} originally shipped)<Input type="number" min="0" step="0.01" max={-Number(s.qty)} placeholder="Quantity from this source" value={sourceQtys[s.id] ?? ""} onChange={e => setSourceQtys(prev => ({ ...prev, [s.id]: e.target.value }))} /></Label>)}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cm-location">Return to location</Label>
            <Select value={locationId} onValueChange={v => { setLocationId(v); setBinId(""); }}>
              <SelectTrigger id="cm-location">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {shipmentId !== null && <Label className="flex flex-col gap-2">Return to bin<select className="rounded border p-2" required value={binId} onChange={e => setBinId(e.target.value)}><option value="">Choose bin</option>{bins.filter(b => b.location_id === locationId).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Label>}
          <div className="flex flex-col gap-2">
            <Label htmlFor="cm-reason">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="cm-reason">
                <SelectValue placeholder="Why is it coming back?" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="unsold">Unsold · back to stock</SelectItem>
                  <SelectItem value="wrong_item">Wrong item · back to stock</SelectItem>
                  <SelectItem value="damaged">Damaged · written to loss</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">Credited at the price on this invoice, not today’s price group.</p>
          <CommandFormMessage error={form.error ?? loadError} />
          <CommandFormFooter>
            <Button type="submit" disabled={form.submitting || !reason || !locationId || (shipmentId !== null && !binId) || !!loadError}>
              {form.submitting ? "Saving…" : "Return shipment"}
            </Button>
          </CommandFormFooter>
        </form>
      </CommandForm>
  );
}
