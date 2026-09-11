export type MovementKind = "opening_balance" | "production_in" | "adjustment" | "depletion"
  | "return_in" | "destruction" | "loss" | "sample" | "festival_removal";
export type MovementDraft = {
  skuId?: string;
  kind?: MovementKind;
  direction?: "add" | "remove";
  locationId?: string;
  binId?: string;
  lotChoice?: "untracked" | string;
  qty?: string;
  saleChannelId?: string;
  destState?: string;
  note?: string;
};
export type MovementInput = {
  skuId: string;
  locationId: string;
  binId: string;
  qty: number;
  type: MovementKind;
  lotId?: string;
  saleChannelId?: string;
  destState?: string;
  note?: string;
};
export type ComposerEffect = {
  label: string;
  qty?: string;
  bbl?: string;
  stockBeforeQty?: string;
  stockAfterQty?: string;
  taxTreatment?: string | null;
  correction?: string | null;
};
export type ComposerProposal = {
  name: "record_movement";
  input: MovementInput;
  previewToken: string;
  effects: ComposerEffect[];
  warnings: string[];
};
export type ComposerHistoryMessage = {
  id: string;
  role: "user" | "assistant" | "result";
  content: string | null;
  result?: unknown;
  created_at: string;
};

export function movementFormHref(input: MovementInput, handoffId?: string) {
  const query = new URLSearchParams({
    recordMovement: "1", skuId: input.skuId, locationId: input.locationId,
    binId: input.binId, qty: String(input.qty), type: input.type,
  });
  if (input.lotId) query.set("lotId", input.lotId);
  if (input.saleChannelId) query.set("saleChannelId", input.saleChannelId);
  if (input.destState) query.set("destState", input.destState);
  if (input.note) query.set("note", input.note);
  if (handoffId) query.set("movementHandoff", handoffId);
  return `/inventory?${query}`;
}

export function movementFormInstanceKey(handoffId?: string) {
  return handoffId ? `composer:${handoffId}` : "manual";
}
