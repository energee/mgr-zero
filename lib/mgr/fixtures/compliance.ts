// lib/mgr/fixtures/compliance.ts — compliance month, licenses, sheet, and lot snapshots.
import { APPROVAL_KINDS, type BrandApprovalViewModel } from "@/lib/mgr/brand-approval-view";
import type { ComplianceMonthsViewModel } from "@/lib/mgr/compliance-months-view";
import type { LicensesSnapshot } from "@/lib/mgr/licenses-view";
import type { LicenseViewModel } from "@/lib/mgr/license-view";
import type { MaterialLotTraceSnapshot } from "@/lib/mgr/material-lot-trace-view";
import type { LotTraceSnapshot } from "@/lib/mgr/lot-trace-view";
import type { StateRegistrationViewModel } from "@/lib/mgr/state-registration-view";

export const complianceMonthsDemo: ComplianceMonthsViewModel = {
  cadences: ["Monthly", "Quarterly", "Annual"],
  cadence: 0,
  months: [
    { key: "2026-09", title: "September 2026", detail: "in progress · file once the month ends", tone: "w" },
    { key: "2026-08", title: "August 2026", detail: "needs amendment · filed 2026-09-02", tone: "w" },
    { key: "2026-07", title: "July 2026", detail: "filed 2026-08-04 · 38.75 bbl taxable", tone: "ok" },
  ],
  registry: { key: "registry", title: "Licenses", detail: "the brewery’s state licenses" },
  lots: [{ key: "l-hz", title: "L-240831-HZ", detail: "Hazy IPA · packaged 2026-08-31" }],
};

export const licensesDemo: LicensesSnapshot = {
  licenses: [
    { id: "pa", state: "PA", kind: "brewery", license_no: "G-21884", expires_on: "2027-06-30", note: null },
  ],
  note: "Order confirmation does not read licenses yet; a warning for an unlicensed destination state is planned and will never block.",
};

export const brandApprovalStout: BrandApprovalViewModel = {
  brand: "Stout",
  kind: "cola",
  kindOptions: APPROVAL_KINDS,
  number: "25318001000034",
  serialNumber: "260135",
  approvedOn: "2026-02-03",
  colas: {
    permit: "BR-PA-21007",
    rows: [
      { ttbId: "25318001000034", permit: "BR-PA-21007", serial: "260135", completedOn: "2026-02-03", fancifulName: "STOUT", brandName: "RIVERSIDE BREWING", classCode: "901", className: "BEER" },
      { ttbId: "24102001000417", permit: "BR-PA-21007", serial: null, completedOn: "2024-04-19", fancifulName: "OATMEAL STOUT", brandName: "RIVERSIDE BREWING", classCode: "906", className: "MALT BEVERAGES SPECIALITIES - FLAVORED" },
    ],
  },
};

export const stateRegistrationHazy: StateRegistrationViewModel = {
  brand: "Hazy IPA",
  state: "OH",
  registrationNo: "OH-88214",
  expiresOn: "2026-12-31",
};

export const licensePaBrewery: LicenseViewModel = {
  state: "PA",
  kind: "brewery",
  licenseNo: "G-21884",
  expiresOn: "2027-06-30",
};

export const lotTraceHazy: LotTraceSnapshot = {
  lot: { code: "L-240831-HZ", brand: "Hazy IPA", packaged_on: "2026-08-31", best_by: "2027-02-27" },
  run: { run_no: 28, bbl_drawn: 25, vessel: "FV-3" },
  batch: { batch_no: 41, brewed_on: "2026-08-10" },
  batches: [{ id: "batch-40", batch_no: 40, brewed_on: "2026-08-09" }, { id: "batch-41", batch_no: 41, brewed_on: "2026-08-10" }],
  ingredients: [{ material_id: "hops", material: "Citra hops", lot_id: "h77", code: "H-77", unit: "lb", source: "boil", qty: 8 }],
  transfers: [{ id: "blend", from_occupancy_id: "source", to_occupancy_id: "receiving", from_batch_id: "batch-40", to_batch_id: "batch-41", from_vessel: "FV-2", to_vessel: "FV-3", bbl: 10, at: "2026-08-30T12:00:00Z" }],
  movements: [
    { id: "in", type: "production_in", qty: 120, bbl: 7.74, bin: "Cooler", ref: null, source_movement_id: null, created_at: "2026-08-31T12:00:00Z", sku: "16 oz case", location: "Warehouse" },
    { id: "sample", type: "sample", qty: -2, bbl: -0.13, bin: "Cooler", ref: null, source_movement_id: null, created_at: "2026-09-02T12:00:00Z", sku: "16 oz case", location: "Warehouse" },
  ],
  on_hand_bbl: 7.61,
  balances: [
    { sku_id: "case", bin_id: "cooler", sku: "Hazy IPA · 16 oz case", bin: "Cooler", location: "Warehouse", qty: 118, bbl: 7.61 },
  ],
  recipients: [],
  warning: "Only recorded lot identities are traced. Historical untracked stock and consumption cannot be assigned to this lot.",
};


export const materialLotTraceCitra: MaterialLotTraceSnapshot = {
  lot: { id: "h77", code: "H-77", material: "Citra hops", unit: "lb", vendor: "Fictional Hop Supply", received_on: "2026-08-01", best_by: null },
  on_hand: 12,
  used: [{ id: "use40", qty: 4, at: "2026-08-09T12:00:00Z", stage: "boil", batch_id: "batch40", run_id: null }, { id: "use41", qty: 4, at: "2026-08-10T12:00:00Z", stage: "boil", batch_id: "batch41", run_id: null }],
  batches: [{ id: "batch40", batch_no: 40, brewed_on: "2026-08-09", closed_at: null }, { id: "batch41", batch_no: 41, brewed_on: "2026-08-10", closed_at: null }],
  runs: [], lots: [{ id: "finished", code: "L-240831-HZ", packaged_on: "2026-08-31" }],
  recipients: [{ id: "order1", order_no: 101, customers: { id: "customer1", name: "Fictional Corner Bar" }, ship_tos: { label: "main", country: "US", address1: "1 Sample St", city: "Sample", state: "PA", zip: "19100" }, shipments: [{ id: "shipment1", carrier: null, tracking: null, invoices: [{ id: "invoice1", invoice_no: 101 }] }] }],
  unlinked_qty: 0,
  warning: "Only recorded material identities and effective consumption are traced. Historical untracked stock cannot be assigned to a lot; recorded blend membership is not a proportional share.",
};
