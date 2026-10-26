// lib/mgr/contract-view.ts — view-model for Contract (inventory sheet).
import { poLineErrors } from "@/lib/mgr/new-po-view";
import { numberNotationError } from "@/lib/mgr/quantity-input";
import { submitReason } from "@/lib/mgr/submit-reason";

export type ContractViewModel = {
  vendorId: string;
  vendorOptions: { id: string; label: string }[];
  materialId: string;
  materialOptions: { id: string; label: string }[];
  quantity: string;
  received: string;
  onOrder: string;
  available: string;
  starts: string;
  ends: string;
  unitCost: string;
  contractNo: string;
};

/** Keep an existing contract's vendor; a new contract can choose the sole available vendor. */
export function initialContractVendor(contract: { vendor_id: string } | undefined, vendors: readonly { id: string }[]): string {
  if (contract) return contract.vendor_id;
  return vendors.length === 1 ? vendors[0]!.id : "";
}

/**
 * The read-only balance fields on the Contract sheet. `contract_balances`
 * returns received / on order / available in PURCHASE units (like
 * `qty_committed`), so the label is the material's `purchase_uom`, never its
 * base unit (#465). A new contract (undefined) shows blanks.
 */
export function contractBalanceFields(
  contract: { qty_received?: number; qty_on_order?: number; qty_available?: number; purchase_uom?: string } | undefined,
): Pick<ContractViewModel, "received" | "onOrder" | "available"> {
  const unit = contract?.purchase_uom ? ` ${contract.purchase_uom}` : "";
  return {
    received: contract?.qty_received == null ? "" : `${contract.qty_received}${unit} · read-only`,
    onOrder: contract?.qty_on_order == null ? "" : `${contract.qty_on_order}${unit} · read-only`,
    available: contract?.qty_available == null ? "" : `${contract.qty_available}${unit}`,
  };
}

/** Why Save contract remains unavailable: the required links and quantity must
 * exist, numeric fields must obey the PO rules, and typed exponent notation is
 * never converted silently before the command sees it. */
export function contractSubmitReason(fields: Pick<ContractViewModel, "vendorId" | "materialId" | "quantity" | "unitCost">): string | null {
  const errors = poLineErrors({ qty: fields.quantity, cost: fields.unitCost });
  const missing: string[] = [];
  if (!fields.vendorId) missing.push("a vendor");
  if (!fields.materialId) missing.push("a material");
  if (!fields.quantity.trim()) missing.push("a quantity");
  else if (numberNotationError(fields.quantity)) missing.push("a decimal quantity");
  else if (errors.qty) missing.push("a quantity above zero");
  if (numberNotationError(fields.unitCost)) missing.push("a decimal unit cost");
  else if (errors.cost) missing.push("a unit cost of zero or more");
  return submitReason(missing);
}
