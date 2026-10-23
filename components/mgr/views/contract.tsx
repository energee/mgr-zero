// components/mgr/views/contract.tsx — shared Contract sheet body. An empty
// Vendor or Material picker says how to add one (#1123).
import { useId, type ReactNode } from "react";
import { DatePicker } from "@/components/mgr/date-picker";
import { E, type PickEmpty } from "@/components/mgr/e";
import type { ContractViewModel } from "@/lib/mgr/contract-view";
import { noMaterialsPick } from "@/lib/mgr/materials-view";

export type { ContractViewModel };

type Controls = Partial<Record<
  "vendorId" | "materialId" | "quantity" | "starts" | "ends" | "unitCost" | "contractNo",
  (value: string) => void
>>;

// The sheet opens over Vendors, so a link there would not leave it: the note names the page's own button.
const NO_VENDORS: PickEmpty = { text: "No vendors yet. Close this form and choose Add vendor." };

function ContractSelect({ id, label, value, options, onChange, empty }: {
  id: string;
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange?: (value: string) => void;
  empty: PickEmpty;
}) {
  return (
    E.pick(label, value, options.map(option => ({ value: option.id, label: option.label })), { onChange, placeholder: label, id, empty })
  );
}

export function ContractView({ model, controls = {}, messages, footer }: {
  model: ContractViewModel;
  controls?: Controls;
  messages?: ReactNode;
  footer?: ReactNode;
}) {
  const id = useId();
  return (
    <>
      <ContractSelect id={`${id}-vendor`} label="Vendor" value={model.vendorId} options={model.vendorOptions} onChange={controls.vendorId} empty={NO_VENDORS} />
      <ContractSelect id={`${id}-material`} label="Material" value={model.materialId} options={model.materialOptions} onChange={controls.materialId} empty={noMaterialsPick("/materials")} />
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
