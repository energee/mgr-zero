// lib/mgr/money.ts — cents to a display string. Negatives (credit memos) get a
// true minus sign ahead of the dollar sign, so a credit reads as a credit
// wherever it is shown.
export const money = (cents: number) =>
  `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

/** Cents as the text of a dollars input: "12.50", or "" for no value. */
export const dollarsInput = (cents: number | null | undefined) => cents == null ? "" : (cents / 100).toFixed(2);
