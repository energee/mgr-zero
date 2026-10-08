// Fictional saved-draft options for the shared inventory editor; no live effects.
import type { EditDraftOrderModel } from "@/components/mgr/views/edit-draft-order";

export const editDraftOrder: EditDraftOrderModel = {
  title: "ORD-0042", customer: "River Market", kind: "wholesale",
  shipToId: "dock", shipTos: [{ id: "dock", label: "Loading dock" }, { id: "shop", label: "Shop entrance" }],
  requestedShipDate: "2026-10-12", poNumber: "PO-42",
  skus: [{ id: "pils", label: "Pils - case" }, { id: "stout", label: "Stout - case" }],
  lines: [{ skuId: "pils", qty: "3" }, { skuId: "stout", qty: "2" }],
};
