// lib/mgr/contract-view.ts — view-model for Contract (inventory sheet).
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
