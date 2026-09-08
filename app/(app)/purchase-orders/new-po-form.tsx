// app/(app)/purchase-orders/new-po-form.tsx — CommandForm for
// create_purchase_order: vendor, expected date, and material lines (quantity
// in purchase units, unit cost, and the lot the vendor named — advisory, and
// only asked for on a lot-tracked material). Saves a draft.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

type Vendor = { id: string; name: string };
type Material = { id: string; name: string; purchase_uom: string; lot_tracked: boolean };
type Line = { materialId: string; qty: string; cost: string; lot: string };
const EMPTY: Line = { materialId: "", qty: "", cost: "", lot: "" };

export function NewPoForm({ vendors, materials }: { vendors: Vendor[]; materials: Material[] }) {
  const [vendorId, setVendorId] = useState("");
  const [expectedOn, setExpectedOn] = useState("");
  const [lines, setLines] = useState<Line[]>([EMPTY]);
  const valid = lines.filter((l) => l.materialId && Number(l.qty) > 0);
  const form = useCommandForm("create_purchase_order", {
    build: () => ({
      vendorId, expectedOn: expectedOn || undefined,
      lines: valid.map((l) => ({
        materialId: l.materialId, qtyOrdered: Number(l.qty),
        unitCostCents: l.cost === "" ? undefined : Math.round(Number(l.cost) * 100),
        expectedLotCode: l.lot.trim() || undefined,
      })),
    }),
    reset: () => { setVendorId(""); setExpectedOn(""); setLines([EMPTY]); },
  });
  const set = (i: number, patch: Partial<Line>) => setLines((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New PO" trigger={<Button size="sm">New PO</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="po-vendor">Vendor</Label>
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger id="po-vendor"><SelectValue placeholder="Vendor" /></SelectTrigger>
            <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="po-expected">Expected · optional</Label>
          <Input id="po-expected" type="date" value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Lines</Label>
          {lines.map((l, i) => {
            const m = materials.find((x) => x.id === l.materialId);
            return (
              <div key={i} className="flex flex-col gap-1 rounded-md border p-2">
                <div className="flex gap-2">
                  <Select value={l.materialId} onValueChange={(v) => set(i, { materialId: v })}>
                    <SelectTrigger aria-label={`Line ${i + 1} material`}><SelectValue placeholder="Material" /></SelectTrigger>
                    <SelectContent>{materials.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input aria-label={`Line ${i + 1} quantity`} type="number" min="0" step="any" className="w-24" placeholder={m?.purchase_uom ?? "qty"} value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} />
                </div>
                <div className="flex gap-2">
                  <Input aria-label={`Line ${i + 1} unit cost`} type="number" min="0" step="0.01" placeholder="Unit cost ($)" value={l.cost} onChange={(e) => set(i, { cost: e.target.value })} />
                  {m?.lot_tracked && <Input aria-label={`Line ${i + 1} expected lot`} placeholder="Expected lot" value={l.lot} onChange={(e) => set(i, { lot: e.target.value })} />}
                </div>
              </div>
            );
          })}
          <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setLines((prev) => [...prev, EMPTY])}>Add line</Button>
        </div>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !vendorId || valid.length === 0}>{form.submitting ? "Saving…" : "Save draft"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
