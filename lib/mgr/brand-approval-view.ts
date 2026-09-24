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

/** The upsert_brand_approval input from the sheet's fields. The sheet's
 *  submitted date is stored as approved_on. The upsert replaces the whole row,
 *  so an edit sends back the expiry and note the sheet does not show; omitting
 *  them would clear them (#438). */
export function approvalInput(
  brandId: string,
  f: { kind: string; ttbId: string; submittedOn: string },
  existing?: { id: string; expires_on: string | null; note: string | null },
) {
  return {
    id: existing?.id, brandId, kind: f.kind, ttbId: f.ttbId, approvedOn: f.submittedOn || undefined,
    expiresOn: existing?.expires_on ?? undefined, note: existing?.note ?? undefined,
  };
}
