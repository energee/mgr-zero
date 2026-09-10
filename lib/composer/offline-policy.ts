import { z } from "zod";

export const fermentationReadingInput = z.object({
  occupancyId: z.string().uuid(),
  at: z.string().datetime({ offset: true }),
  tempF: z.number(),
  gravityPlato: z.number().optional(),
  ph: z.number().optional(),
  note: z.string().optional(),
}).strict();

export const fermentationReadingOfflinePolicy = {
  name: "record_fermentation_reading" as const,
  input: fermentationReadingInput,
  roles: ["admin", "brewer"] as const,
  idempotency: "dedupe" as const,
  offlineReplay: true,
};
