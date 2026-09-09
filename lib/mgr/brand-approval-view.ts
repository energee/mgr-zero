// lib/mgr/brand-approval-view.ts — view-model for Brand approval sheet.
export type BrandApprovalViewModel = {
  brand: string;
  brandOptions: string[];
  kind: string;
  kindOptions: string[];
  numberLabel: string;
  number?: string;
  approvedOn?: string;
  expiresOn?: string;
};

export function toBrandApprovalViewProps(s: BrandApprovalViewModel): BrandApprovalViewModel {
  return s;
}
