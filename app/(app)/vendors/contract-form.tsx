// app/(app)/vendors/contract-form.tsx — CommandForm for upsert_material_contract:
// one vendor, one material, the committed quantity (purchase units), an
// optional price and window. Received and on-order are read-only evidence on
// the Contracts list, never typed here.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

export type Contract = {
  id: string; vendor_id: string; material_id: string; contract_no: string | null; unit_cost_cents: number | null;
  starts_on: string | null; ends_on: string | null; qty_committed: number;
};
type Option = { id: string; name: string };

export function ContractForm({ contract, vendors, materials }: { contract?: Contract; vendors: Option[]; materials: Option[] }) {
  const initialCost = contract?.unit_cost_cents == null ? "" : (contract.unit_cost_cents / 100).toFixed(2);
  const [vendorId, setVendorId] = useState(contract?.vendor_id ?? "");
  const [materialId, setMaterialId] = useState(contract?.material_id ?? "");
  const [qty, setQty] = useState(contract?.qty_committed?.toString() ?? "");
  const [cost, setCost] = useState(initialCost);
  const [startsOn, setStartsOn] = useState(contract?.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(contract?.ends_on ?? "");
  const [contractNo, setContractNo] = useState(contract?.contract_no ?? "");
  const form = useCommandForm("upsert_material_contract", {
    build: () => ({
      id: contract?.id, vendorId, materialId, qtyCommitted: Number(qty),
      unitCostCents: cost === "" ? undefined : Math.round(Number(cost) * 100),
      startsOn: startsOn || undefined, endsOn: endsOn || undefined, contractNo: contractNo || undefined,
    }),
    reset: () => { setVendorId(contract?.vendor_id ?? ""); setMaterialId(contract?.material_id ?? ""); setQty(contract?.qty_committed?.toString() ?? ""); setCost(initialCost); setStartsOn(contract?.starts_on ?? ""); setEndsOn(contract?.ends_on ?? ""); setContractNo(contract?.contract_no ?? ""); },
  });
  const ready = vendorId && materialId && Number(qty) > 0;
  const trigger = contract ? <Button variant="ghost" size="sm">Edit</Button> : <Button size="sm" variant="outline">Add contract</Button>;
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={contract ? "Contract" : "New contract"} trigger={trigger}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="c-vendor">Vendor</Label>
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger id="c-vendor"><SelectValue placeholder="Vendor" /></SelectTrigger>
            <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="c-material">Material</Label>
          <Select value={materialId} onValueChange={setMaterialId}>
            <SelectTrigger id="c-material"><SelectValue placeholder="Material" /></SelectTrigger>
            <SelectContent>{materials.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="c-qty">Contract quantity</Label>
            <Input id="c-qty" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="c-cost">Unit cost ($) · optional</Label>
            <Input id="c-cost" type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="c-starts">Starts · optional</Label>
            <Input id="c-starts" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="c-ends">Ends · optional</Label>
            <Input id="c-ends" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="c-no">Contract number · optional</Label>
          <Input id="c-no" value={contractNo} onChange={(e) => setContractNo(e.target.value)} />
        </div>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !ready}>{form.submitting ? "Saving…" : "Save contract"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
