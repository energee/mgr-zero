// app/(app)/vendors/contract-form.tsx — CommandForm for upsert_material_contract:
// one vendor, one material, the committed quantity (purchase units), an
// optional price and window. Received and on-order are read-only evidence on
// the Contracts list, never typed here; they are labeled in the purchase unit.
"use client";

import { useState } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { ConfirmDeleteControl } from "@/components/mgr/views/confirm-delete";
import { ContractView } from "@/components/mgr/views/contract";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { contractBalanceFields, contractSubmitReason, initialContractVendor } from "@/lib/mgr/contract-view";
import { dollarsInput, toCents } from "@/lib/mgr/money";
export type Contract = {
  id: string; vendor_id: string; material_id: string; contract_no: string | null; unit_cost_cents: number | null;
  starts_on: string | null; ends_on: string | null; qty_committed: number;
  qty_received?: number; qty_on_order?: number; qty_available?: number; purchase_uom?: string;
};
type Option = { id: string; name: string };

export function ContractForm({ contract, vendors, materials }: { contract?: Contract; vendors: Option[]; materials: Option[] }) {
  const initialCost = dollarsInput(contract?.unit_cost_cents);
  const initialVendorId = initialContractVendor(contract, vendors);
  const [vendorId, setVendorId] = useState(initialVendorId);
  const [materialId, setMaterialId] = useState(contract?.material_id ?? "");
  const [qty, setQty] = useState(contract?.qty_committed?.toString() ?? "");
  const [cost, setCost] = useState(initialCost);
  const [startsOn, setStartsOn] = useState(contract?.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(contract?.ends_on ?? "");
  const [contractNo, setContractNo] = useState(contract?.contract_no ?? "");
  const form = useCommandForm("upsert_material_contract", {
    build: () => ({
      id: contract?.id, vendorId, materialId, qtyCommitted: Number(qty),
      unitCostCents: toCents(cost),
      startsOn: startsOn || undefined, endsOn: endsOn || undefined, contractNo: contractNo || undefined,
    }),
    reset: () => { setVendorId(initialVendorId); setMaterialId(contract?.material_id ?? ""); setQty(contract?.qty_committed?.toString() ?? ""); setCost(initialCost); setStartsOn(contract?.starts_on ?? ""); setEndsOn(contract?.ends_on ?? ""); setContractNo(contract?.contract_no ?? ""); },
    target: contract?.id,
  });
  const trigger = contract ? <Button variant="ghost" size="sm">Edit</Button> : <Button size="sm" variant="outline">Add contract</Button>;
  const model = {
    vendorId,
    vendorOptions: vendors.map(({ id, name }) => ({ id, label: name })),
    materialId,
    materialOptions: materials.map(({ id, name }) => ({ id, label: name })),
    quantity: qty,
    ...contractBalanceFields(contract),
    starts: startsOn,
    ends: endsOn,
    unitCost: cost,
    contractNo,
  };
  const reason = contractSubmitReason(model);
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
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={contract ? "Edit contract" : "New contract"} trigger={trigger}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <ContractView
          model={model}
          controls={controls}
          messages={<CommandFormMessage error={form.error} />}
          footer={
            <CommandFormFooter>
              {E.submit("Save contract", { submitting: form.submitting, reason })}
            </CommandFormFooter>
          }
          remove={contract ? <ConfirmDeleteControl title="Delete contract" busyLabel="Deleting…"
            name="Delete this contract?"
            warning="A contract on a purchase order cannot be deleted. Set an end date instead."
            busy={form.busy} error={form.error}
            onDelete={() => form.run("delete_material_contract", { contractId: contract.id }, () => form.setOpen(false), { target: contract.id })} /> : null}
        />
      </form>
    </CommandForm>
  );
}
