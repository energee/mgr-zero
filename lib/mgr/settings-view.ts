// lib/mgr/settings-view.ts — view-model for Settings (get_brewery extras).
import type { GatewayModelOption } from "@/lib/chat/models";

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
  aiModels: GatewayModelOption[];
  deployment: string;
  /** Portal fulfillment location id, or null when none is set. */
  warehouseId: string | null;
  warehouseOptions: { id: string; name: string }[];
  locations: string;
  team: string;
};
