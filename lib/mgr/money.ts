// lib/mgr/money.ts — cents to a display string. Negatives (credit memos) get a
// true minus sign ahead of the dollar sign, so a credit reads as a credit
// wherever it is shown.
export const money = (cents: number) =>
  `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
