// lib/mgr/contract-view.ts — view-model for Contract (inventory sheet).
export type ContractViewModel = {
  vendor: string;
  material: string;
  quantity: string;
  received: string;
  onOrder: string;
  available: string;
  starts: string;
  ends: string;
  unitCost: string;
};

export function toContractViewProps(s: ContractViewModel): ContractViewModel {
  return s;
}
