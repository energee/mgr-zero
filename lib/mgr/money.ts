// lib/mgr/money.ts — cents to a display string, and a dollars field back to cents. Negatives (credit memos) get a
// true minus sign ahead of the dollar sign, so a credit reads as a credit
// wherever it is shown.
export const money = (cents: number) =>
  `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

/** Cents as the text of a dollars input: "12.50", or "" for no value. */
export const dollarsInput = (cents: number | null | undefined) => cents == null ? "" : (cents / 100).toFixed(2);

/** The text of a dollars field as integer cents, or undefined for an empty field. */
export const toCents = (dollars: string) => dollars === "" ? undefined : Math.round(Number(dollars) * 100);

/** Prices, costs, fees and deposits are stored as int cents, so a dollars field holds at most $21,474,836.47
 *  (PG_INT_MAX cents). Returns the field message naming that limit, or undefined within it. `what` reads
 *  "a cost", "a fee" or "an amount". */
export const centsMaxError = (dollars: string, what: string) =>
  (toCents(dollars) ?? 0) > 2_147_483_647 ? `Enter ${what} no greater than $21,474,836.47.` : undefined;
