// lib/mgr/brand-approval-view.ts — view-model for Brand approval sheet.
export type BrandApprovalViewModel = {
  brandId: string;
  brand: string;
  brandOptions: { id: string; label: string }[];
  kind: string;
  kindOptions: { value: string; label: string }[];
  numberLabel: string;
  number?: string;
  approvedOn?: string;
  expiresOn?: string;
};

export function toBrandApprovalViewProps(s: BrandApprovalViewModel): BrandApprovalViewModel {
  return s;
}
