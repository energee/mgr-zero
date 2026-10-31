"use client";

// components/mgr/views/contract.tsx — shared Contract sheet body. An empty
// Vendor or Material picker says how to add one (#1123). Ends cannot precede
// Starts, and a set date can be cleared (#1494).
import { useId, type ReactNode } from "react";
import { ConfirmDeleteControl } from "./confirm-delete";
import { E, type PickEmpty } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { poLineErrors } from "@/lib/mgr/new-po-view";
import { numberNotationError } from "@/lib/mgr/quantity-input";
import { useTouchedLines } from "@/lib/mgr/touched-lines";
import { contractDateError, contractSubmitReason, type ContractViewModel } from "@/lib/mgr/contract-view";
import { noMaterialsPick } from "@/lib/mgr/materials-view";

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

/** An optional date. The calendar cannot return to blank, so a set date offers
 * Clear; the server stores the blank as no date. Inventory has no onChange and no Clear. */
function ContractDate({ id, label, clearLabel, value, onChange, error }: {
  id: string;
  label: string;
  clearLabel: string;
  value: string;
  onChange?: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {E.edit(label, value, "date", undefined, { id, onChange, error })}
      {onChange && value ? <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => onChange("")}>{clearLabel}</Button> : null}
    </div>
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
      <div className="flex min-w-0 flex-col gap-2">
        {E.inline(
          E.edit("Contract quantity", model.quantity, "number", undefined, { id: `${id}-quantity`, onChange: controls.quantity, onBlur: () => touched.touch(QUANTITY), error: touched.shown(QUANTITY) ? quantityError : undefined, required: Boolean(controls.quantity), min: 0, step: "any", "aria-describedby": `${id}-number-help` }),
          E.edit("Unit cost ($) · optional", model.unitCost, "number", undefined, { id: `${id}-cost`, onChange: controls.unitCost, onBlur: () => touched.touch(UNIT_COST), error: touched.shown(UNIT_COST) ? costError : undefined, min: 0, "aria-describedby": `${id}-number-help` }),
        )}
        <FieldDescription id={`${id}-number-help`}>Quantity is in the material’s purchase unit and may be fractional, stored to four decimal places. Unit cost decimals are rounded to the nearest cent.</FieldDescription>
      </div>
      {model.received && E.fld("Received", model.received)}
      {model.onOrder && E.fld("On order", model.onOrder)}
      {model.available && E.fld("Available to release", model.available)}
      {E.inline(
        <ContractDate id={`${id}-starts`} label="Starts · optional" clearLabel="Clear start date" value={model.starts} onChange={controls.starts} />,
        <ContractDate id={`${id}-ends`} label="Ends · optional" clearLabel="Clear end date" value={model.ends} onChange={controls.ends} error={contractDateError(model.starts, model.ends)} />,
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
