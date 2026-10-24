import type { ColaDetails, ColaRecord } from "@/lib/ttb/colas";
import type { CatalogBrandRow } from "./catalog-view";

export type ColaReviewBrand = Pick<CatalogBrandRow, "id" | "name" | "alias" | "colas">;

/** Saved IDs survive renames; a name or alias suggests other labels to review. */
export function matchingBrandColas(brand: ColaReviewBrand, records: ColaRecord[]): ColaRecord[] {
  const names = [brand.name, brand.alias].filter((name): name is string => Boolean(name?.trim())).map(name => name.trim().toLowerCase());
  return records.filter(record => brand.colas.some(cola => cola.ttb_id === record.ttbId)
    || names.some(name => record.fancifulName.toLowerCase().includes(name) || record.brandName.toLowerCase().includes(name)));
}

/** Brands showing "None on file" in Catalog: the review starts with these selected. */
export function missingColaIds(brands: ColaReviewBrand[]): string[] {
  return brands.filter(brand => !brand.colas.length).map(brand => brand.id);
}

/** One candidate is the obvious choice; two or more stay the reviewer's call. */
export function soleColaId(candidates: ColaRecord[]): string {
  return candidates.length === 1 ? candidates[0]!.ttbId : "";
}

/** The saved label when TTB still publishes it, else the only label, else no choice yet. */
export function defaultColaImage(details: ColaDetails, savedUrl?: string | null): string {
  const saved = details.images.find(image => image.url === savedUrl);
  if (saved) return saved.url;
  return details.images.length === 1 ? details.images[0]!.url : "";
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
