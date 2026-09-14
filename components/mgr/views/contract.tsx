// components/mgr/views/contract.tsx — shared Contract sheet body.
import type { ReactNode } from "react";
import { DatePicker } from "@/components/mgr/date-picker";
import { E } from "@/components/mgr/e";
import type { ContractViewModel } from "@/lib/mgr/contract-view";

export type { ContractViewModel };

type Controls = Partial<Record<
  "vendorId" | "materialId" | "quantity" | "starts" | "ends" | "unitCost" | "contractNo",
  (value: string) => void
>>;

function ContractSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange?: (value: string) => void;
}) {
  return (
    E.pick(label, value, options.map(option => ({ value: option.id, label: option.label })), { onChange, placeholder: label })
  );
}

export function ContractView({ model, controls = {}, messages, footer }: {
  model: ContractViewModel;
  controls?: Controls;
  messages?: ReactNode;
  footer?: ReactNode;
}) {

  return (
    <>
      <ContractSelect label="Vendor" value={model.vendorId} options={model.vendorOptions} onChange={controls.vendorId} />
      <ContractSelect label="Material" value={model.materialId} options={model.materialOptions} onChange={controls.materialId} />
      {E.inline(
        E.edit("Contract quantity", model.quantity, "number", undefined, { onChange: controls.quantity, required: Boolean(controls.quantity), min: 0, step: "any" }),
        E.edit("Unit cost ($) · optional", model.unitCost, "number", undefined, { onChange: controls.unitCost, min: 0 }),
      )}
      {model.received && E.fld("Received", model.received)}
      {model.onOrder && E.fld("On order", model.onOrder)}
      {model.available && E.fld("Available to release", model.available)}
      {E.inline(
        controls.starts
          ? <DatePicker label="Starts · optional" value={model.starts} onChange={controls.starts} />
          : <DatePicker label="Starts · optional" defaultValue={model.starts} />,
        controls.ends
          ? <DatePicker label="Ends · optional" value={model.ends} onChange={controls.ends} />
          : <DatePicker label="Ends · optional" defaultValue={model.ends} />,
      )}
      {E.edit("Contract number · optional", model.contractNo, "text", undefined, controls.contractNo && { onChange: controls.contractNo })}
      {messages}
      {footer !== undefined ? footer : E.btn("Save contract")}
    </>
  );
}
