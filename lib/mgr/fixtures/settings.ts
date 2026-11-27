// lib/mgr/fixtures/settings.ts — Settings inventory snapshot.
import type { SettingsViewModel } from "@/lib/mgr/settings-view";
import { toUnitsViewProps } from "@/lib/mgr/units-view";
import { unitsPlato } from "@/lib/mgr/fixtures/settings-catalog";

/** The demo brewery's zone: inventory frames print fixture timestamps in it, as live pages print in breweries.timezone (#442). */
export const DEMO_TIME_ZONE = "America/New_York";
export const basisCorrectionDemo = {
  id: "00000000-0000-4000-8000-000000000939", old_basis: "2026-01-01", new_basis: null,
  corrected_by: "00000000-0000-4000-8000-000000000001", corrected_at: "2026-09-03T14:30:00Z",
  reason: "Include verified opening inventory from the prior year",
};

export const settingsDemo: SettingsViewModel = {
  name: "Demo Brewing",
  timezone: DEMO_TIME_ZONE,
  timezoneOptions: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"],
  ttb: "BR-PA-12345",
  phone: "(610) 555-0142",
  overdueHours: "24",
  daysToPackage: "14",
  booksOpenedOn: "",
  hasFiledReports: true,
  basisCorrections: [basisCorrectionDemo],
  agentsEnabled: false,
  suggestions: { saved: false, last4: null, enabled: false },
  aiModel: "anthropic/claude-sonnet-4.5",
  aiModels: [
    { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
    { id: "openai/gpt-5.4", name: "GPT-5.4" },
  ],
  deployment: "dedicated",
  warehouseId: "00000000-0000-4000-8000-0000000000f1",
  warehouseOptions: [{ id: "00000000-0000-4000-8000-0000000000f1", name: "Warehouse" }],
  locations: "Warehouse · Taproom",
  team: "3 members · 1 pending invite",
  units: toUnitsViewProps(unitsPlato),
  releases: { openPct: "75", orderByDays: "7", capLiftDays: "14", digestDay: "1", shareWindowDays: "90", stockMultiplier: "2", maxSharePct: "50" },
  pallets: {
    sizes: ["half_bbl", "sixth_bbl"],
    values: { maxLb: "2500", maxHeightIn: "60", palletHeightIn: "5.5", kegLayers: [{ half_bbl: "8" }, { half_bbl: "6", sixth_bbl: "6" }, { half_bbl: "3", sixth_bbl: "10" }, { sixth_bbl: "20" }] },
  },
  releaseShares: [
    { customer_id: "00000000-0000-4000-8000-0000000000c1", customer_name: "Ridgeline Taphouse", manual_pct: null, base_pct: 15, pct: 18 },
    { customer_id: "00000000-0000-4000-8000-0000000000c2", customer_name: "Harbor Bottle Shop", manual_pct: 25, base_pct: 31, pct: 25 },
    { customer_id: "00000000-0000-4000-8000-0000000000c3", customer_name: "Corner Deli", manual_pct: null, base_pct: null, pct: null },
  ],
};
