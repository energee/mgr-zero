// lib/mgr/brand-approval-view.ts — view-model for Brand approval sheet. The
// sheet is only ever opened from one brand, so the brand is stated, not picked.
// Type-only import: this module stays client-safe (lib/ttb/colas.ts uses node:https).
import type { ColaDetails, ColaRecord } from "@/lib/ttb/colas";

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
  /** Dated, approved details fetched from this TTB ID, independent of name search. */
  colaDetails?: ColaDetails;
  imageUrl?: string;
  loadingCola?: boolean;
  busy?: boolean;
  /** Previously saved IDs are suggestions, never a restriction on direct entry. */
  existingColaIds?: string[];
  updatesExisting?: boolean;
};

export const APPROVAL_KINDS = [{ value: "cola", label: "COLA" }, { value: "formula", label: "Formula" }];

/** TTB assigns exactly 14 digits to a COLA; a formula number is a different identifier. */
export function approvalNumberError(kind: string, value: string): string | undefined {
  if (kind === "cola") return /^\d{14}$/.test(value) ? undefined : "Enter the 14-digit TTB ID, including any leading zeros.";
  return value.trim() ? undefined : "Enter a formula number.";
}

/** A COLA is keyed by the TTB ID that TTB assigns; a formula by its formula number. */
export function approvalNumberLabel(kind: string): string {
  return kind === "formula" ? "Formula number" : "TTB ID";
}

/** TTB's public COLA form (the label approval itself) for a TTB ID, or null without one. Only the
 *  encoded TTB ID varies; the origin and path are fixed. The link is not proof
 *  of approval, and the applicant serial is never used. */
export function colaUrl(ttbId: string): string | null {
  const id = ttbId.trim();
  return !approvalNumberError("cola", id) ? `https://ttbonline.gov/colasonline/viewColaDetails.do?action=publicFormDisplay&ttbid=${id}` : null;
}

/** Keeps an explicit edit's identity; Add reuses the brand's matching approval.
 *  Expiry and note stay omitted. Empty visible fields clear their columns.
 *  Images are sent only with a dated COLA; clearing the date lets the RPC
 *  remove the saved image. Identifiers preserve leading zeros. */
export function approvalInput(
  brandId: string,
  f: { kind: string; ttbId: string; serialNumber: string; approvedOn: string; imageUrl?: string },
  existing?: { id: string },
  approvals: readonly { id: string; kind: string; ttb_id: string }[] = [],
) {
  const ttbId = f.ttbId.trim();
  const saved = existing ?? approvals.find(approval => approval.kind === f.kind && approval.ttb_id === ttbId);
  const serial = f.kind === "cola" ? { serialNumber: f.serialNumber.trim() || null } : {};
  const image = f.kind === "cola" && f.approvedOn && f.imageUrl ? { imageUrl: f.imageUrl } : {};
  return { id: saved?.id, brandId, kind: f.kind, ttbId, ...serial, approvedOn: f.approvedOn || null, ...image };
}

/** What Use copies from a TTB COLA into the sheet: its TTB ID, serial (a
 *  missing serial clears the field) and TTB's completed date, which is the
 *  approval date. */
export function colaChoice(record: ColaRecord): { ttbId: string; serialNumber: string; approvedOn: string } {
  return { ttbId: record.ttbId, serialNumber: record.serial ?? "", approvedOn: record.completedOn };
}
