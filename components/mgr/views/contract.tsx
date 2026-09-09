// components/mgr/views/contract.tsx — Contract inventory sheet. Live stays
// ContractForm.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ContractViewModel } from "@/lib/mgr/contract-view";

export type { ContractViewModel };

export function ContractView({ model, form }: { model: ContractViewModel; form?: ReactNode }) {
  return form ?? (
    <>
      {E.nav("Vendor", model.vendor)}
      {E.nav("Material", model.material)}
      {E.edit("Contract quantity", model.quantity, "number")}
      {E.fld("Received", model.received)}
      {E.fld("On order", model.onOrder)}
      {E.fld("Available to release", model.available)}
      {E.edit("Starts", model.starts, "date")}
      {E.edit("Ends", model.ends, "date")}
      {E.edit("Unit cost", model.unitCost)}
      {E.btn("Save contract")}
    </>
  );
}
