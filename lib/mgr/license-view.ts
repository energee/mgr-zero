// lib/mgr/license-view.ts — view-model for License sheet.
import { US_STATE_CODES } from "@/lib/mgr/enums";
import { submitReason } from "@/lib/mgr/submit-reason";

export type LicenseViewModel = {
  state: string;
  kind: string;
  licenseNo?: string;
  expiresOn?: string;
};

/** Keep the withheld Save explanation aligned with the shared state picker. */
export function licenseSubmitReason(fields: Pick<LicenseViewModel, "state" | "kind">): string | null {
  const missing: string[] = [];
  if (!US_STATE_CODES.some((state) => state === fields.state)) missing.push("a state");
  if (!fields.kind.trim()) missing.push("a kind");
  return submitReason(missing);
}

/** The upsert_brewery_state_license input from the sheet's fields. The upsert
 *  keeps the note the sheet does not show because it is omitted (#438, #522);
 *  an empty field is null so clearing it clears the saved value. */
export function licenseInput(f: { state: string; kind: string; licenseNo: string; expiresOn: string }) {
  return { state: f.state.toUpperCase(), kind: f.kind, licenseNo: f.licenseNo || null, expiresOn: f.expiresOn || null };
}
