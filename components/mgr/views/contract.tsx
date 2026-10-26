"use client";

// components/mgr/views/contract.tsx — shared Contract sheet body. An empty
// Vendor or Material picker says how to add one (#1123).
import { useId, type ReactNode } from "react";
import { DatePicker } from "@/components/mgr/date-picker";
import { ConfirmDeleteControl } from "./confirm-delete";
import { E, type PickEmpty } from "@/components/mgr/e";
import { poLineErrors } from "@/lib/mgr/new-po-view";
import { numberNotationError } from "@/lib/mgr/quantity-input";
import { useTouchedLines } from "@/lib/mgr/touched-lines";
import { contractSubmitReason, type ContractViewModel } from "@/lib/mgr/contract-view";
import { noMaterialsPick } from "@/lib/mgr/materials-view";
export type { ContractViewModel };

type Controls = Partial<Record<
  "vendorId" | "materialId" | "quantity" | "starts" | "ends" | "unitCost" | "contractNo",
  (value: string) => void
>>;

// The sheet opens over Vendors, so a link there would not leave it: the note names the page's own button.
const NO_VENDORS: PickEmpty = { text: "No vendors yet. Close this form and choose Add vendor." };

/** Named useTouchedLines slots: this sheet has two numeric fields, not repeated rows. */
const QUANTITY = 0;
const UNIT_COST = 1;

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

export function ContractView({ model, controls = {}, messages, footer, remove }: {
  model: ContractViewModel;
  controls?: Controls;
  messages?: ReactNode;
  footer?: ReactNode;
  /** Live: the command-bound delete control, null while creating. Inventory
   * leaves it out so ConfirmDeleteControl's local success path simulates delete. */
  remove?: ReactNode;
}) {
  const id = useId();
  const touched = useTouchedLines(!controls.quantity && !controls.unitCost);
  const errors = poLineErrors({ qty: model.quantity, cost: model.unitCost });
  const quantityError = numberNotationError(model.quantity) ?? errors.qty;
  const costError = numberNotationError(model.unitCost) ?? errors.cost;
  const removal = remove !== undefined ? remove : model.vendorId && model.materialId
    ? <ConfirmDeleteControl title="Delete contract" busyLabel="Deleting…" name="Delete this contract?"
      warning="A contract on a purchase order cannot be deleted. Set an end date instead." />
    : null;
  return (
    <>
      <ContractSelect id={`${id}-vendor`} label="Vendor" value={model.vendorId} options={model.vendorOptions} onChange={controls.vendorId} empty={NO_VENDORS} />
      <ContractSelect id={`${id}-material`} label="Material" value={model.materialId} options={model.materialOptions} onChange={controls.materialId} empty={noMaterialsPick("/materials")} />
      {E.inline(
        E.edit("Contract quantity", model.quantity, "number", undefined, { id: `${id}-quantity`, onChange: controls.quantity, onBlur: () => touched.touch(QUANTITY), error: touched.shown(QUANTITY) ? quantityError : undefined, required: Boolean(controls.quantity), min: 0, step: "any" }),
        E.edit("Unit cost ($) · optional", model.unitCost, "number", undefined, { id: `${id}-cost`, onChange: controls.unitCost, onBlur: () => touched.touch(UNIT_COST), error: touched.shown(UNIT_COST) ? costError : undefined, min: 0 }),
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
      {footer !== undefined ? footer : E.submit("Save contract", { reason: contractSubmitReason(model) })}
      {removal ? <section aria-label="Delete contract" className="mt-2 flex flex-col gap-4 border-t pt-5 @min-[48rem]:flex-row @min-[48rem]:items-center @min-[48rem]:justify-between">
        <div>
          <h2 className="text-sm font-medium">Delete contract</h2>
          <p className="mt-1 text-sm text-muted-foreground">Only a contract with no purchase orders can be deleted. Set an end date instead.</p>
        </div>
        <div className="shrink-0 self-start">{removal}</div>
      </section> : null}
    </>
  );
}
