import { z } from "zod";

/** Plausible reading ranges, shared by the command schema and the reading form
 *  (#468). Both fit their columns (temp_f numeric(5,1), ph numeric(4,2)), so an
 *  out-of-range value is a 400 the outbox treats as permanent, never a 500. */
export const READING_BOUNDS = {
  // Below freezing brine (cold crash, glycol) through boiling (hot-side check).
  tempF: { min: 25, max: 212 },
  ph: { min: 0, max: 14 },
} as const;

export const fermentationReadingInput = z.object({
  occupancyId: z.string().uuid(),
  at: z.string().datetime({ offset: true }),
  tempF: z.number().min(READING_BOUNDS.tempF.min).max(READING_BOUNDS.tempF.max),
  gravityPlato: z.number().optional(),
  ph: z.number().min(READING_BOUNDS.ph.min).max(READING_BOUNDS.ph.max).optional(),
  note: z.string().optional(),
}).strict();

export const fermentationReadingOfflinePolicy = {
  name: "record_fermentation_reading" as const,
  input: fermentationReadingInput,
  roles: ["admin", "brewer"] as const,
  idempotency: "dedupe" as const,
  offlineReplay: true,
};
