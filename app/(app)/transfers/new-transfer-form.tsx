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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
            <Select value={fromId} onValueChange={(v) => { setFromId(v); setFromBin(firstBin(v)); }}>
              <SelectTrigger id="trf-from"><SelectValue placeholder="Location" /></SelectTrigger>
              <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={fromBin} onValueChange={setFromBin} disabled={!fromId}>
              <SelectTrigger aria-label="From bin"><SelectValue placeholder="Bin" /></SelectTrigger>
              <SelectContent>{bins.filter((b) => b.location_id === fromId).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="trf-to">To</Label>
            <Select value={toId} onValueChange={(v) => { setToId(v); setToBin(firstBin(v)); }}>
              <SelectTrigger id="trf-to"><SelectValue placeholder="Location" /></SelectTrigger>
              <SelectContent>{locations.filter((l) => l.id !== fromId).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={toBin} onValueChange={setToBin} disabled={!toId}>
              <SelectTrigger aria-label="To bin"><SelectValue placeholder="Bin" /></SelectTrigger>
              <SelectContent>{bins.filter((b) => b.location_id === toId).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Lines</Label>
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2">
              <Select value={l.skuId} onValueChange={(v) => setLines((prev) => prev.map((x, j) => (j === i ? { ...x, skuId: v } : x)))}>
                <SelectTrigger aria-label={`Line ${i + 1} SKU`}><SelectValue placeholder="SKU" /></SelectTrigger>
                <SelectContent>{skus.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
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
