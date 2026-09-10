// lib/mgr/fixtures/purchasing.ts — PO, materials, and vendor snapshots.
// Views own no sample data.
import type { ContractViewModel } from "@/lib/mgr/contract-view";
import type { ContractsSnapshot } from "@/lib/mgr/contracts-view";
import type { CycleCountViewModel } from "@/lib/mgr/cycle-count-view";
import type { MaterialViewModel } from "@/lib/mgr/material-view";
import type { MaterialsSnapshot } from "@/lib/mgr/materials-view";
import type { MaterialsOnHandSnapshot } from "@/lib/mgr/materials-on-hand-view";
import type { NewPoViewModel } from "@/lib/mgr/new-po-view";
import type { PurchaseOrdersSnapshot } from "@/lib/mgr/purchase-orders-view";
import type { ReceiptViewModel } from "@/lib/mgr/receipt-view";
import type { ReceivePoViewModel } from "@/lib/mgr/receive-po-view";
import type { VendorViewModel } from "@/lib/mgr/vendor-view";
import type { VendorsSnapshot } from "@/lib/mgr/vendors-view";

export const purchaseOrdersWarehouse: PurchaseOrdersSnapshot = {
  title: "Work",
  subtitle: "warehouse default",
  rows: [
    { key: "po142", title: "PO-0142 · Country Malt", detail: "sent · due Thu", verb: "Receive", tone: "info" },
    { key: "po141", title: "PO-0141 · YCH", detail: "partially received · 1 Citra box due", verb: "Receive", tone: "info", warning: true },
    { key: "po143", title: "PO-0143 · CanSource", detail: "draft · 4 pallets", verb: "Send", tone: "info" },
  ],
};

export const newPoCountryMalt: NewPoViewModel = {
  vendor: "Country Malt",
  expected: "2026-09-10",
  lines: [
    { key: "malt", title: "2-row · 55 lb bags", detail: "lot-tracked", qty: 40, cost: "$28.50", lot: "CM-26-4410" },
    { key: "citra", title: "Citra · 44 lb boxes", detail: "lot-tracked", qty: 4, cost: "$9.40", lot: "2026-CIT-77" },
    { key: "hulls", title: "Rice hulls · 50 lb", detail: "not lot-tracked", qty: 6, cost: "$0.62" },
  ],
};

export const receivePoCountryMalt: ReceivePoViewModel = {
  title: "PO-0142 · Country Malt",
  status: "sent Mon · expected Thu · nothing received yet",
  lines: [
    {
      key: "malt", title: "2-row · 55 lb bags", detail: "expected 40 · lot from the PO", qty: 42, warning: true,
      lot: "CM-26-4410", lotOptions: ["CM-26-4410", "CM-26-4288", "CM-25-9910"], bestBy: "2027-03-31",
    },
    {
      key: "citra", title: "Citra · 44 lb boxes", detail: "expected 4 · lot from the PO", qty: 3, warning: true,
      lot: "2026-CIT-91", lotOptions: ["2026-CIT-77", "2026-CIT-91", "2025-CIT-40"], bestBy: "2027-08-31",
      note: "Substituted: the PO named 2026-CIT-77. The box decides; the receipt records both.",
    },
    { key: "hulls", title: "Rice hulls · 50 lb", detail: "expected 6 · not lot-tracked", qty: 6, ok: true },
  ],
  tape: [
    ["+2,310 lb 2-row · receipt", "lot CM-26-4410 · over 2 bags"],
    ["+132 lb Citra · receipt", "lot 2026-CIT-91 · substituted · short 1"],
    ["+300 lb rice hulls · receipt", "not lot-tracked"],
  ],
  info: "2-row is over by 2 bags and Citra short 1 on a substituted lot; the PO becomes partially received.",
};

export const receiptPoCountryMalt: ReceiptViewModel = {
  title: "PO-0142 · received",
  status: "partially received",
  stillOwed: "1 Citra box · 44 lb",
  tape: [
    ["+2,310 lb 2-row · receipt", "lot CM-26-4410 · over 2 bags"],
    ["+132 lb Citra · receipt", "lot 2026-CIT-91 · substituted · short 1"],
    ["+300 lb rice hulls · receipt", "not lot-tracked"],
  ],
  info: "2-row is over by 2 bags and Citra short 1 on a substituted lot.",
};

export const materialsOnHandList: MaterialsOnHandSnapshot = {
  rows: [
    { key: "cans", title: "Cans · 16 oz", detail: "3,100 each · 2 lots · best by none", verb: "Count", tone: "info" },
    { key: "citra", title: "Citra 2026 · YCH", detail: "262 lb · 1 lot · best by 8/31/27", verb: "Count", tone: "info" },
    { key: "malt", title: "2-row 2026 · Country Malt", detail: "8,800 lb · 3 lots · best by 3/15/27", verb: "Count", tone: "info" },
    { key: "yeast", title: "Yeast · WLP066", detail: "2 brinks · 2 lots · best by 9/8/26", verb: "Count", tone: "info", warning: true },
  ],
};

export const cycleCountCans: CycleCountViewModel = {
  material: "Cans · 16 oz",
  qty: "3050",
  unitIndex: 0,
  units: ["each", "case"],
  preview: "system 3,100 · variance −50 · from lot L-0774, best by 3/15/27",
};

export const materialsList: MaterialsSnapshot = {
  rows: [
    { key: "citra", title: "Citra", detail: "hop · lb · 262 lb on hand", verb: "Edit" },
    { key: "malt", title: "2-row", detail: "grain · lb · 8,800 lb on hand", verb: "Edit" },
    { key: "cans", title: "Cans · 16 oz", detail: "packaging · each · 3,100 on hand", verb: "Edit" },
  ],
};

export const materialCitra: MaterialViewModel = {
  name: "Citra",
  kind: "Hop",
  kindOptions: ["Malt", "Hop", "Yeast", "Adjunct", "Chemical", "Packaging", "Other"],
  baseUnits: "44",
  purchaseUnit: "each",
  purchaseUnitOptions: ["each", "lb", "kg", "oz", "g", "l", "gal", "ml"],
  unit: "lb",
  unitOptions: ["lb", "oz", "kg", "each"],
  lotTracked: true,
  active: true,
};

export const vendorsList: VendorsSnapshot = {
  rows: [
    { key: "ych", title: "YCH", detail: "hops · 1 active contract", verb: "Edit" },
    { key: "cm", title: "Country Malt", detail: "grain · 1 active contract", verb: "Edit" },
    { key: "can", title: "CanSource", detail: "packaging · 3 materials", verb: "Edit" },
  ],
  materials: "12 materials",
  contracts: "2 active commitments",
};

export const vendorYch: VendorViewModel = {
  name: "YCH",
  email: "orders@ych.example",
  phone: "509-555-0142",
  terms: "Net 30",
  termsOptions: ["Due on receipt", "Net 15", "Net 30"],
  leadDays: "7",
};

export const contractsList: ContractsSnapshot = {
  rows: [
    { key: "ych", title: "YCH · Citra 2026", detail: "400 committed · 262 received · 100 on order · 38 lb available", verb: "Edit", warning: true },
    { key: "cm", title: "Country Malt · 2-row 2026", detail: "20,000 committed · 8,800 received · 0 on order · 11,200 lb available", verb: "Edit" },
  ],
};

export const contractYchCitra: ContractViewModel = {
  vendor: "YCH",
  material: "Citra 2026",
  quantity: "400",
  received: "262 lb · read-only",
  onOrder: "100 lb · read-only",
  available: "38 lb",
  starts: "2026-09-01",
  ends: "2026-10-31",
  unitCost: "$9.40",
};
