import type { ParsViewModel } from "./pars-view";

export type ReplenishmentSuggestion = { skuId: string; sku: string; par: number; onHand: number; suggested: number };
export type ReplenishmentAllocation = { id: string; skuId: string; sku: string; qty: number };
export type ReplenishmentShortfall = { skuId: string; onHand: number; allocated: number; atp: number; detail: ParsViewModel };

export type ReplenishmentViewModel = {
  backHref?: string;
  locationId: string | null;
  locationName: string | null;
  locations: { value: string; label: string; href?: string }[];
  warehouses: { id: string; name: string }[];
  suggestions: ReplenishmentSuggestion[];
  allocations: ReplenishmentAllocation[];
  shortfalls: ReplenishmentShortfall[];
  canEdit: boolean;
  skuFilter?: string;
  locationsHref?: string;
  allShortfallsHref?: string;
};
