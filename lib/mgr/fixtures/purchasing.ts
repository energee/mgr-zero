// lib/mgr/fixtures/purchasing.ts — PO, materials, and vendor snapshots.
// Views own no sample data.
import type { ContractViewModel } from "@/lib/mgr/contract-view";
import type { ContractsSnapshot } from "@/lib/mgr/contracts-view";
import type { CycleCountViewModel } from "@/lib/mgr/cycle-count-view";
import type { MaterialViewModel } from "@/lib/mgr/material-view";
import type { MaterialsOnHandSnapshot } from "@/lib/mgr/materials-on-hand-view";
import type { NewPoViewModel } from "@/lib/mgr/new-po-view";
import type { PurchaseOrdersSnapshot } from "@/lib/mgr/purchase-orders-view";
import type { ReceiptViewModel } from "@/lib/mgr/receipt-view";
import { CORRECTION_INFO, type ReceivePoViewModel } from "@/lib/mgr/receive-po-view";
import type { VendorViewModel } from "@/lib/mgr/vendor-view";
import type { VendorDetailSnapshot } from "@/lib/mgr/vendor-detail-view";
import type { VendorsSnapshot } from "@/lib/mgr/vendors-view";

export const purchaseOrdersWarehouse: PurchaseOrdersSnapshot = {
  title: "Purchase orders",
  subtitle: "warehouse default",
  rows: [
    { key: "po142", title: "PO-0142 · Fictional Malt Supply", detail: "Sent Sep 7, 2026 · expected Sep 10, 2026", verb: "Receive", tone: "info" },
    { key: "po141", title: "PO-0141 · Fictional Hop Supply", detail: "Partially received · 1 line still due", verb: "Receive", tone: "info", warning: true },
    { key: "po143", title: "PO-0143 · CanSource", detail: "Draft", verb: "Mark sent", tone: "info" },
  ],
};

export const newPoDraft: NewPoViewModel = {
  vendor: "Fictional Malt Supply",
  expected: "2026-09-10",
  lines: [
    { key: "malt", materialId: "malt", title: "2-row · 55 lb bags", detail: "lot-tracked", qty: 40, cost: "$28.50", lot: "CM-26-4410" },
    { key: "citra", materialId: "citra", title: "Citra · 44 lb boxes", detail: "lot-tracked", qty: 4, cost: "$9.40", lot: "2026-CIT-77" },
    { key: "hulls", materialId: "hulls", title: "Rice hulls · 50 lb", detail: "not lot-tracked", qty: 6, cost: "$0.62" },
  ],
};

/** New PO on a brewery with no vendors yet and one line typed wrong: the
 *  empty picker, field errors and withheld Save draft (#1121–#1123). */
export const newPoIncomplete: NewPoViewModel = {
  vendor: "",
  vendors: [],
  expected: "",
  lines: [{ key: "malt", materialId: "malt", title: "2-row · 55 lb bags", detail: "lot-tracked", qty: "-4", cost: "-3", lot: "" }],
};

export const receivePoSent: ReceivePoViewModel = {
  state: "sent", closure: "cancel", closureReason: "Vendor cannot fulfil this order", locationId: "warehouse", binId: "shelf", receivedOn: "2026-09-10",
  locations: [{ id: "warehouse", name: "Warehouse" }], bins: [{ id: "shelf", name: "Shelf" }],
  title: "PO-0142 · Fictional Malt Supply",
  status: "Marked sent Sep 7, 2026 · expected Sep 10, 2026",
  lines: [
    {
      key: "malt", title: "2-row · 55 lb bags", detail: "expected 40 · lot from the PO", qty: 42, warning: true,
      cost: "28.50",
      lot: "CM-26-4410", lotOptions: ["CM-26-4410", "CM-26-4288", "CM-25-9910"], bestBy: "2027-03-31",
    },
    {
      key: "citra", title: "Citra · 44 lb boxes", detail: "expected 4 · lot from the PO", qty: 3, warning: true,
      cost: "",
      lot: "2026-CIT-91", lotOptions: ["2026-CIT-77", "2026-CIT-91", "2025-CIT-40"], bestBy: "2027-08-31",
      note: "Substituted: the PO named 2026-CIT-77. The box decides; the receipt records both.",
    },
    { key: "hulls", title: "Rice hulls · 50 lb", detail: "expected 6 · not lot-tracked", qty: 6, cost: "0.62", ok: true },
  ],
  tape: [
    ["+2,310 lb 2-row · receipt", "lot CM-26-4410 · over 2 bags"],
    ["+132 lb Citra · receipt", "lot 2026-CIT-91 · substituted · short 1"],
    ["+300 lb rice hulls · receipt", "not lot-tracked"],
  ],
  info: "2-row is over by 2 bags and Citra short 1 on a substituted lot; the PO becomes partially received.",
};

/** A draft PO: Mark sent and Edit draft lead; Cancel folds below (#1584). */
export const draftPoCanSource: ReceivePoViewModel = {
  state: "draft", closure: "cancel", title: "PO-0143 · CanSource", status: "Draft · expected Oct 30, 2026",
  lines: [
    { key: "cans", title: "Cans · 16 oz", detail: "ordered 3 pallets", qty: "3 pallets" },
  ],
};

/** Edit PO on the same draft: the New PO form on its saved vendor and lines (#1584). */
export const editPoCanSource: NewPoViewModel = {
  title: "Edit PO-0143",
  vendor: "CanSource",
  expected: "2026-10-30",
  lines: [
    { key: "cans", materialId: "cans", title: "Cans · 16 oz", detail: "pallet · not lot-tracked", qty: 3, cost: "$1850.00" },
  ],
};

export const receiptPoPartial: ReceiptViewModel = {
  correction: {},
  bill: { receiptId: "receipt-malt-supply", status: "not_posted", action: "post" },
  title: "PO-0142 · receipt Sep 10, 2026", backTo: "PO-0142",
  status: "partially received",
  stillOwed: "1 Citra box · 44 lb",
  tape: [
    ["+2,310 lb 2-row · receipt", "lot CM-26-4410 · over 2 bags"],
    ["+132 lb Citra · receipt", "lot 2026-CIT-91 · substituted · short 1"],
    ["+300 lb rice hulls · receipt", "not lot-tracked"],
  ],
  info: "2-row is over by 2 bags and Citra short 1 on a substituted lot.",
  revisions: [{ label: "Original receipt", href: "#" }, { label: "Corrected receipt", href: "#" }],
};

export const receiptPoBillPending: ReceiptViewModel = {
  ...receiptPoPartial,
  bill: { receiptId: "receipt-malt-supply", requestId: "frozen-bill-request", status: "pending", action: "retry",
    error: "QuickBooks did not return a confirmed Bill ID. Reconcile the original saved attempt." },
};

export const receiptPoBillPosted: ReceiptViewModel = {
  ...receiptPoPartial,
  bill: { receiptId: "receipt-malt-supply", requestId: "frozen-bill-request", status: "pushed", billId: "731" },
  revisions: [{ label: "Original receipt" }],
  tape: [
    ["+2,200 lb 2-row · receipt", "lot CM-26-4410 · as expected"],
    ["+132 lb Citra · receipt", "lot 2026-CIT-91 · substituted · short 1"],
    ["+300 lb rice hulls · receipt", "not lot-tracked"],
  ],
  info: "Corrected receipt: two malt bags were counted twice. The original Bill remains posted in QuickBooks.",
};

export const receiptPoBillRejected: ReceiptViewModel = {
  ...receiptPoPartial,
  bill: { receiptId: "receipt-malt-supply", status: "push_failed", action: "corrected", mappingHref: "#",
    error: "QuickBooks rejected the purchase account. Verify the exact account ID before posting a corrected Bill." },
};

export const correctReceiptPo: ReceivePoViewModel = {
  title: "PO-0142 · correct receipt", state: "correction", status: "Received Sep 10, 2026",
  correctionReason: "Two malt bags were counted twice",
  locationId: receivePoSent.locationId, binId: receivePoSent.binId, receivedOn: receivePoSent.receivedOn,
  locations: receivePoSent.locations, bins: receivePoSent.bins,
  lines: receivePoSent.lines?.map(line => ({ ...line, qty: line.key === "malt" ? 40 : line.qty,
    detail: `originally counted ${line.qty} purchase units`, lotOptions: undefined, note: undefined })),
  tape: [["+2,200 lb 2-row · replacement preview", "Lot CM-26-4410"], ["+132 lb Citra · replacement preview", "Lot 2026-CIT-91"], ["+300 lb rice hulls · replacement preview", "untracked"]],
  info: CORRECTION_INFO,
};

/** list_materials rows with on hand summed across bins, as the live page passes them. */
export const materialsOnHandList: MaterialsOnHandSnapshot = {
  rows: [
    { key: "cans", name: "Cans · 16 oz", category: "packaging", unit: "each", onHand: 3100, lotTracked: false, active: true },
    { key: "citra", name: "Citra 2026 · Fictional Hop Supply", category: "hop", unit: "lb", onHand: 262, lotTracked: true, active: true },
    { key: "malt", name: "2-row 2026 · Fictional Malt Supply", category: "malt", unit: "lb", onHand: 8800, lotTracked: true, active: true },
    { key: "yeast", name: "Yeast · WLP066", category: "yeast", unit: "each", onHand: 0, lotTracked: true, active: false },
  ],
};

const cansLine: CycleCountViewModel["lines"][number] = {
  key: "cans",
  material: "Cans · 16 oz",
  qty: "3050",
  unitIndex: 0,
  units: ["each"],
  preview: "system 3,100 · variance −50 · reviewed against current stock",
  adjustments: [{ key: "lot-0774", lot: "L-0774", expected: 3100, counted: 3050, delta: -50, unit: "each" }],
};

export const cycleCountCans: CycleCountViewModel = {
  lines: [cansLine],
  locationId: "warehouse", binId: "shelf",
  locations: [{ id: "warehouse", name: "Warehouse" }],
  bins: [{ id: "shelf", name: "Shelf" }],
};

/** Count sheet at the warehouse shelf: two lines counted and previewed, one left blank (#1583). */
export const countSheetShelf: CycleCountViewModel = {
  ...cycleCountCans,
  lines: [
    cansLine,
    { key: "gypsum", material: "Gypsum", qty: "", unitIndex: 0, units: ["g"], preview: "system 2,000 · not counted" },
    { key: "lids", material: "Lids · 202", qty: "1200", unitIndex: 0, units: ["each"], preview: "system 1,200 · variance 0 · reviewed against current stock", adjustments: [] },
  ],
};

export const materialCitra: MaterialViewModel = {
  name: "Citra",
  kind: "hop",
  kindOptions: ["malt", "hop", "yeast", "adjunct", "chemical", "packaging", "other"],
  baseUnits: "44",
  purchaseUnit: "each",
  purchaseUnitOptions: ["lb", "kg", "oz", "g", "each", "l", "gal", "ml"],
  unit: "lb",
  unitOptions: ["lb", "kg", "oz", "g", "each", "l", "gal", "ml"],
  defaultVendorId: "hop-supply",
  defaultVendorOptions: [
    { id: "hop-supply", label: "Fictional Hop Supply" },
    { id: "cm", label: "Fictional Malt Supply" },
  ],
  lotTracked: true,
  active: true,
};

/** list_vendors_and_contracts rows, as the live page passes them. */
export const vendorsList: VendorsSnapshot = {
  rows: [
    { key: "hop-supply", name: "Fictional Hop Supply", active: true, lead_time_days: 7, observed: [{ sent_via: "mailto", n: 4, avg_lead_days: 6.5 }], contracts: [{ id: "hop-supply-citra" }] },
    { key: "cm", name: "Fictional Malt Supply", active: true, lead_time_days: 10, observed: [], contracts: [{ id: "cm-2row" }] },
    { key: "can", name: "CanSource", active: false, lead_time_days: null, observed: [], contracts: [] },
  ],
  materials: "12 materials",
  contracts: "2 active commitments",
};

/** One vendor's page: the first Vendors row with its contract, a sent order
 *  and two default materials, one of them inactive. */
export const vendorDetail: VendorDetailSnapshot = {
  vendor: {
    ...vendorsList.rows![0], email: "orders@hop-supply.example", phone: "509-555-0142", payment_terms: "net30",
    contracts: [{ id: "hop-supply-citra", contract_no: "Citra 2026", material_name: "Citra", qty_committed: 400, qty_received: 262, qty_on_order: 100, qty_available: 38 }],
  },
  purchaseOrders: [{ id: "po141", po_no: 141, status: "sent", closed_at: null, ordered_on: "2026-09-03", expected_on: "2026-09-10", lines_open: 1 }],
  materials: [
    { id: "citra", name: "Citra 2026", category: "hop", purchase_uom: "each", active: true },
    { id: "mosaic", name: "Mosaic 2025", category: "hop", purchase_uom: "each", active: false },
  ],
};

export const vendorEdit: VendorViewModel = {
  name: "Fictional Hop Supply",
  email: "orders@hop-supply.example",
  phone: "509-555-0142",
  terms: "Net 30",
  termsOptions: ["Due on receipt", "Net 15", "Net 30"],
  leadDays: "7",
  active: true,
};

export const contractsList: ContractsSnapshot = {
  rows: [
    { key: "hop-supply", title: "Fictional Hop Supply · Citra 2026", detail: "400 committed · 262 received · 100 on order · 38 lb available", verb: "Edit", warning: true },
    { key: "cm", title: "Fictional Malt Supply · 2-row 2026", detail: "20,000 committed · 8,800 received · 0 on order · 11,200 lb available", verb: "Edit" },
  ],
};

export const contractEdit: ContractViewModel = {
  vendorId: "hop-supply",
  vendorOptions: [{ id: "hop-supply", label: "Fictional Hop Supply" }],
  materialId: "citra",
  materialOptions: [{ id: "citra", label: "Citra 2026" }],
  quantity: "400",
  received: "262 lb · read-only",
  onOrder: "100 lb · read-only",
  available: "38 lb",
  starts: "2026-09-01",
  ends: "2026-10-31",
  unitCost: "9.40",
  contractNo: "CITRA-2026",
};
