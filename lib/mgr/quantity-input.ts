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
