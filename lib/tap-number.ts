import { z } from "zod";

// Stored identifiers stay text, so validation never rewrites old tap records.
// New numbers must also fit JavaScript's exact whole-number representation.
export const TAP_NUMBER_MAX_DIGITS = 80;
export const TAP_NUMBER_NEED = "a positive whole tap number, or no number";
export const tapNumberSchema = z.string().trim()
  .max(TAP_NUMBER_MAX_DIGITS, `Enter ${TAP_NUMBER_NEED}.`)
  .regex(/^[0-9]*[1-9][0-9]*$/, `Enter ${TAP_NUMBER_NEED}.`)
  .refine(value => Number.isSafeInteger(Number(value)), `Enter ${TAP_NUMBER_NEED}.`);
