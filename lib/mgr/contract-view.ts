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

export function toContractViewProps(s: ContractViewModel): ContractViewModel {
  return s;
}
