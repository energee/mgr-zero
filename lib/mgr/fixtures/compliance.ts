// lib/mgr/fixtures/compliance.ts — compliance month, registry, and lot snapshots.
import type { BrandApprovalViewModel } from "@/lib/mgr/brand-approval-view";
import type { ComplianceMonthsViewModel } from "@/lib/mgr/compliance-months-view";
import type { ComplianceRegistrySnapshot } from "@/lib/mgr/compliance-registry-view";
import type { LicenseViewModel } from "@/lib/mgr/license-view";
import type { LotTraceSnapshot } from "@/lib/mgr/lot-trace-view";
import type { StateRegistrationViewModel } from "@/lib/mgr/state-registration-view";

export const complianceMonthsDemo: ComplianceMonthsViewModel = {
  months: [
    { key: "2026-09", title: "September 2026", detail: "not filed · ready to review", tone: "w" },
    { key: "2026-08", title: "August 2026", detail: "filed 2026-09-02 · 41.20 bbl taxable", tone: "ok" },
    { key: "2026-07", title: "July 2026", detail: "filed 2026-08-04 · 38.75 bbl taxable", tone: "ok" },
  ],
  registry: { key: "registry", title: "Compliance registry", detail: "brands, states and licenses" },
  lots: [{ key: "l-hz", title: "L-240831-HZ", detail: "Hazy IPA · packaged 2026-08-31" }],
};

export const complianceRegistryDemo: ComplianceRegistrySnapshot = {
  brands: [
    {
      id: "hazy", name: "Hazy IPA",
      approvals: [{ id: "cola", brand_id: "hazy", kind: "cola", ttb_id: "23001001000123", approved_on: "2026-01-15", expires_on: "2031-01-15", note: null }],
      registrations: [{ id: "oh", brand_id: "hazy", state: "OH", registration_no: "OH-88214", approved_on: null, expires_on: "2026-12-31" }],
    },
    { id: "stout", name: "Stout", approvals: [], registrations: [] },
  ],
  licenses: [
    { id: "pa", state: "PA", kind: "brewery", license_no: "G-21884", expires_on: "2027-06-30", note: null },
  ],
  note: "Order confirmation does not read this registry yet; a warning for an unregistered destination state is planned and will never block.",
};

export const brandApprovalStout: BrandApprovalViewModel = {
  brand: "Stout",
  brandOptions: ["Hazy IPA", "Pils", "Stout"],
  kind: "COLA",
  kindOptions: ["COLA", "Formula"],
  numberLabel: "COLA number",
  approvedOn: "2026-01-15",
  expiresOn: "2031-01-15",
};

export const stateRegistrationHazy: StateRegistrationViewModel = {
  brand: "Hazy IPA",
  brandOptions: ["Hazy IPA", "Pils", "Stout"],
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
