// lib/mgr/brand-approval-view.ts — view-model for Brand approval sheet. The
// sheet is only ever opened from one brand, so the brand is stated, not picked.
// Type-only import: this module stays client-safe (lib/ttb/colas.ts uses node:https).
import type { ColaRecord } from "@/lib/ttb/colas";

export type BrandApprovalViewModel = {
  brand: string;
  kind: string;
  kindOptions: { value: string; label: string }[];
  /** ttb_id: a COLA's TTB-assigned TTB ID, or a formula's number. */
  number?: string;
  /** A COLA's applicant-assigned serial; a formula has none. */
  serialNumber?: string;
  /** The date TTB approved it (approved_on); Use fills it from TTB's completed date. */
  approvedOn?: string;
  /** search_colas while it runs: Find COLA shows "Searching TTB…" and is disabled. */
  searching?: boolean;
  /** search_colas' answer for this brand; undefined until Find COLA is pressed. */
  colas?: { permit: string; rows: ColaRecord[] };
};

export const APPROVAL_KINDS = [{ value: "cola", label: "COLA" }, { value: "formula", label: "Formula" }];

/** A COLA is keyed by the TTB ID that TTB assigns; a formula by its formula number. */
export function approvalNumberLabel(kind: string): string {
  return kind === "formula" ? "Formula number" : "TTB ID";
}

/** TTB's public COLA form (the label approval itself) for a TTB ID, or null without one. Only the
 *  encoded TTB ID varies; the origin and path are fixed. The link is not proof
 *  of approval, and the applicant serial is never used. */
export function colaUrl(ttbId: string): string | null {
  const id = ttbId.trim();
  return id ? `https://ttbonline.gov/colasonline/viewColaDetails.do?action=publicFormDisplay&ttbid=${encodeURIComponent(id)}` : null;
}

/** The upsert_brand_approval input from the sheet's fields; an edit passes
 *  the record for its id.
 *  The upsert keeps the expiry and note the sheet does not show because they
 *  are omitted (#438, #522); an empty date or COLA serial is null so clearing
 *  it clears it. A formula sends no serial. Identifiers stay strings (#730). */
export function approvalInput(brandId: string, f: { kind: string; ttbId: string; serialNumber: string; approvedOn: string }, existing?: { id: string }) {
  const serial = f.kind === "cola" ? { serialNumber: f.serialNumber.trim() || null } : {};
  return { id: existing?.id, brandId, kind: f.kind, ttbId: f.ttbId, ...serial, approvedOn: f.approvedOn || null };
}

/** What Use copies from a TTB COLA into the sheet: its TTB ID, serial (a
 *  missing serial clears the field) and TTB's completed date, which is the
 *  approval date. */
export function colaChoice(record: ColaRecord): { ttbId: string; serialNumber: string; approvedOn: string } {
  return { ttbId: record.ttbId, serialNumber: record.serial ?? "", approvedOn: record.completedOn };
}
