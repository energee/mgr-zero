// lib/mgr/fixtures/settings.ts — Settings inventory snapshot.
import type { SettingsViewModel } from "@/lib/mgr/settings-view";

export const settingsDemo: SettingsViewModel = {
  name: "Demo Brewing",
  timezone: "America/New_York",
  timezoneOptions: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"],
  ttb: "BR-PA-12345",
  paLicense: "G-1234",
  phone: "(610) 555-0142",
  overdueHours: "24",
  aiModel: "anthropic/claude-sonnet-4.5",
  aiModels: [
    { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
    { id: "openai/gpt-5.4", name: "GPT-5.4" },
  ],
  deployment: "dedicated · read-only",
  warehouse: "Warehouse",
  warehouseOptions: ["Warehouse"],
  sourceWater: "every recipe starts here unless it overrides",
  locations: "Warehouse · Taproom",
  team: "3 members · 1 pending invite",
};
