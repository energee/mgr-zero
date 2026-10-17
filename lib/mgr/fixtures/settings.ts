// lib/mgr/fixtures/settings.ts — Settings inventory snapshot.
import type { SettingsViewModel } from "@/lib/mgr/settings-view";

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
  paLicense: "G-1234",
  phone: "(610) 555-0142",
  overdueHours: "24",
  daysToPackage: "14",
  booksOpenedOn: "",
  hasFiledReports: true,
  basisCorrections: [basisCorrectionDemo],
  oneWayKegFee: "10.00",
  aiModel: "anthropic/claude-sonnet-4.5",
  aiModels: [
    { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", pricing: { input: "0.000003", output: "0.000015" } },
    { id: "openai/gpt-5.4", name: "GPT-5.4", pricing: { input: "0.0000025", output: "0.000015" } },
  ],
  deployment: "dedicated",
  warehouseId: "00000000-0000-4000-8000-0000000000f1",
  warehouseOptions: [{ id: "00000000-0000-4000-8000-0000000000f1", name: "Warehouse" }],
  locations: "Warehouse · Taproom",
  team: "3 members · 1 pending invite",
};
