// app/(app)/transfers/new-transfer-form.tsx — CommandForm for
// create_stock_transfer: source and destination locations (bins default to
// each location's first), SKU lines with quantities. Materials and kegs move
// through the same command from the API; this form draws the SKU case.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useCommandForm } from "@/lib/commands/use-command-form";

type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };
type Line = { skuId: string; qty: string };

export function NewTransferForm({ locations, bins, skus }: { locations: Location[]; bins: Bin[]; skus: { id: string; label: string }[] }) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [fromBin, setFromBin] = useState("");
  const [toBin, setToBin] = useState("");
  const [lines, setLines] = useState<Line[]>([{ skuId: "", qty: "" }]);
  const firstBin = (loc: string) => bins.filter((b) => b.location_id === loc)[0]?.id ?? "";
  const form = useCommandForm("create_stock_transfer", {
    build: () => ({
      fromLocationId: fromId, toLocationId: toId,
      lines: lines.filter((l) => l.skuId && Number(l.qty) > 0).map((l) => ({ skuId: l.skuId, qty: Number(l.qty), fromBinId: fromBin, toBinId: toBin })),
    }),
    reset: () => { setFromId(""); setToId(""); setFromBin(""); setToBin(""); setLines([{ skuId: "", qty: "" }]); },
  });
  const ready = fromId && toId && fromId !== toId && fromBin && toBin && lines.some((l) => l.skuId && Number(l.qty) > 0);
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New transfer" trigger={<Button size="sm">New transfer</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="trf-from">From</Label>
            <NativeSelect id="trf-from" value={fromId} onChange={(e) => { setFromId(e.target.value); setFromBin(firstBin(e.target.value)); }}>
              <option value="">Location</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </NativeSelect>
            <NativeSelect aria-label="From bin" value={fromBin} onChange={(e) => setFromBin(e.target.value)} disabled={!fromId}>
              {bins.filter((b) => b.location_id === fromId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="trf-to">To</Label>
            <NativeSelect id="trf-to" value={toId} onChange={(e) => { setToId(e.target.value); setToBin(firstBin(e.target.value)); }}>
              <option value="">Location</option>{locations.filter((l) => l.id !== fromId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </NativeSelect>
            <NativeSelect aria-label="To bin" value={toBin} onChange={(e) => setToBin(e.target.value)} disabled={!toId}>
              {bins.filter((b) => b.location_id === toId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </NativeSelect>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Lines</Label>
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2">
              <NativeSelect aria-label={`Line ${i + 1} SKU`} value={l.skuId} onChange={(e) => setLines((prev) => prev.map((x, j) => (j === i ? { ...x, skuId: e.target.value } : x)))}>
                <option value="">SKU</option>{skus.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </NativeSelect>
              <Input aria-label={`Line ${i + 1} qty`} type="number" min="0" step="any" className="w-24" value={l.qty} onChange={(e) => setLines((prev) => prev.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setLines((prev) => [...prev, { skuId: "", qty: "" }])}>Add line</Button>
        </div>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !ready}>{form.submitting ? "Saving…" : "Create transfer"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
