// lib/mgr/submit-reason.ts — the sentence printed beside a withheld submit
// button (E.submit), naming what the form still needs (#1122), and the
// "a, b, and c" list it is built from, which the order hint shares.

const conjunction = new Intl.ListFormat("en", { type: "conjunction" });

/** "a vendor and a quantity": English list joining for user-facing copy. */
export const andList = (items: string[]) => conjunction.format(items);

/** Why a form cannot be submitted yet, or null when nothing is missing. Each
 *  item is a need ("a vendor", "a unit cost of zero or more"), so the sentence
 *  fits any verb (Save draft, Create transfer, Confirm repack) and a value to
 *  correct as well as one to add. */
export function submitReason(missing: string[]): string | null {
  return missing.length ? `Still needed: ${andList(missing)}.` : null;
}
