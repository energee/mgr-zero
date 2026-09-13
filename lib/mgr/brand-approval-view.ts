// lib/mgr/brand-approval-view.ts — view-model for Brand approval sheet. The
// sheet is only ever opened from one brand, so the brand is stated, not picked.
export type BrandApprovalViewModel = {
  brand: string;
  kind: string;
  kindOptions: { value: string; label: string }[];
  number?: string;
  /** The date the application was submitted; the approval date is not tracked.
   *  Still carried by the approved_on column until a migration renames it. */
  submittedOn?: string;
};

export const APPROVAL_KINDS = [{ value: "cola", label: "COLA" }, { value: "formula", label: "Formula" }];

/** A COLA is filed under the applicant's own serial; a formula under its TTB number. */
export function approvalNumberLabel(kind: string): string {
  return kind === "formula" ? "Formula number" : "Serial number";
}

export function toBrandApprovalViewProps(s: BrandApprovalViewModel): BrandApprovalViewModel {
  return s;
}
