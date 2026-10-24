import type { ColaDetails, ColaRecord } from "@/lib/ttb/colas";
import type { CatalogBrandRow } from "./catalog-view";

export type ColaReviewBrand = Pick<CatalogBrandRow, "id" | "name" | "alias" | "colas">;

/** Saved IDs survive renames; a name or alias suggests other labels to review. */
export function matchingBrandColas(brand: ColaReviewBrand, records: ColaRecord[]): ColaRecord[] {
  const names = [brand.name, brand.alias].filter((name): name is string => Boolean(name?.trim())).map(name => name.trim().toLowerCase());
  return records.filter(record => brand.colas.some(cola => cola.ttb_id === record.ttbId)
    || names.some(name => record.fancifulName.toLowerCase().includes(name) || record.brandName.toLowerCase().includes(name)));
}

/** Update the matching approval, not a duplicate; no image choice leaves its image alone. */
export function colaApprovalInput(brand: ColaReviewBrand, record: ColaRecord, details: ColaDetails, imageUrl: string) {
  const existing = brand.colas.find(cola => cola.ttb_id === record.ttbId);
  return {
    ...(existing?.id ? { id: existing.id } : {}),
    brandId: brand.id, kind: "cola" as const, ttbId: record.ttbId,
    serialNumber: record.serial, approvedOn: details.approvedOn,
    ...(imageUrl ? { imageUrl } : {}),
  };
}
