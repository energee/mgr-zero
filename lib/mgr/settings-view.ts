// lib/mgr/settings-view.ts — view-model for Settings (get_brewery extras).
export type SettingsViewModel = {
  backHref?: string;
  name: string;
  timezone: string;
  timezoneOptions: string[];
  ttb: string;
  paLicense: string;
  phone: string;
  overdueHours: string;
  aiModel: string;
  aiModels: { id: string; name: string }[];
  deployment: string;
  warehouse: string;
  warehouseOptions: string[];
  sourceWater: string;
  locations: string;
  team: string;
};

export function toSettingsViewProps(s: SettingsViewModel): SettingsViewModel {
  return s;
}
