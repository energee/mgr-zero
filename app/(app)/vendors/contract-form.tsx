// app/(app)/vendors/contract-form.tsx — CommandForm for upsert_material_contract:
// one vendor, one material, the committed quantity (purchase units), an
// optional price and window. Received and on-order are read-only evidence on
// the Contracts list, never typed here.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { ContractView } from "@/components/mgr/views/contract";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { toContractViewProps } from "@/lib/mgr/contract-view";

export type Contract = {
  id: string; vendor_id: string; material_id: string; contract_no: string | null; unit_cost_cents: number | null;
  starts_on: string | null; ends_on: string | null; qty_committed: number;
  qty_received?: number; qty_on_order?: number; qty_available?: number; base_uom?: string;
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
  const unit = contract?.base_uom ? ` ${contract.base_uom}` : "";
  const model = toContractViewProps({
    vendorId,
    vendorOptions: vendors.map(({ id, name }) => ({ id, label: name })),
    materialId,
    materialOptions: materials.map(({ id, name }) => ({ id, label: name })),
    quantity: qty,
    received: contract?.qty_received == null ? "" : `${contract.qty_received}${unit} · read-only`,
    onOrder: contract?.qty_on_order == null ? "" : `${contract.qty_on_order}${unit} · read-only`,
    available: contract?.qty_available == null ? "" : `${contract.qty_available}${unit}`,
    starts: startsOn,
    ends: endsOn,
    unitCost: cost,
    contractNo,
  });
  const controls = {
    vendorId: setVendorId,
    materialId: setMaterialId,
    quantity: setQty,
    unitCost: setCost,
    starts: setStartsOn,
    ends: setEndsOn,
    contractNo: setContractNo,
  };

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={contract ? "Contract" : "New contract"} trigger={trigger}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <ContractView
          model={model}
          controls={controls}
          messages={<CommandFormMessage error={form.error} />}
          footer={
            <CommandFormFooter>
              <Button type="submit" disabled={form.submitting || !ready}>{form.submitting ? "Saving…" : "Save contract"}</Button>
            </CommandFormFooter>
          }
        />
      </form>
    </CommandForm>
  );
}
