/** Buttons move by one, preserving the typed number's decimal precision. */
export function stepQuantity(value: string, direction: -1 | 1, min = -Infinity, max = Infinity): string {
  const current = Number(value) || 0;
  const [mantissa, exponent = "0"] = String(current).split("e");
  const places = Math.max(0, (mantissa.split(".")[1]?.length ?? 0) - Number(exponent));
  // toFixed accepts at most 100 places, including for scientific-notation inputs.
  const next = Number((current + direction).toFixed(Math.min(places, 100)));
  return String(Math.max(min, Math.min(max, next)));
}

/** A typed quantity is a number only when filled: `Number("")` is 0, and a
 *  cleared field must not submit as an explicit zero (#433). */
export const isNumber = (s: string) => s.trim() !== "" && Number.isFinite(Number(s));
export const isPositive = (s: string) => Number(s) > 0;

/** Material quantities are numeric with 4 decimals in the database; add and
 *  compare them as integer ten-thousandths so float sums never drift. */
export const toTicks = (qty: number) => Math.round(qty * 10000);
export const fromTicks = (ticks: number) => ticks / 10000;
