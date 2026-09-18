import { z } from "zod";

export const squareUpsertSchema = z.looseObject({
  idempotency_key: z.string(),
  object: z.looseObject({
    id: z.string(),
    item_data: z.looseObject({
      variations: z.array(z.looseObject({
        id: z.string(), item_variation_data: z.looseObject({ item_id: z.string() }),
      })),
    }),
  }),
});
export type SquareUpsert = z.infer<typeof squareUpsertSchema>;
export const squareSearchSchema = z.looseObject({
  query: z.looseObject({ filter: z.looseObject({ date_time_filter: z.looseObject({
    updated_at: z.object({ start_at: z.string(), end_at: z.string() }),
  }) }) }),
});
