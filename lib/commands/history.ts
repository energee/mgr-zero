import { z } from "zod";

// Keep PostgreSQL's timestamp precision: converting through Date loses microseconds.
export const historyInput = {
  limit: z.number().int().min(1).max(200).default(50),
  cursor: z.string().refine(value => {
    const parts = value.split("~");
    return parts.length === 2 && z.iso.datetime({ offset: true }).safeParse(parts[0]).success && z.uuid().safeParse(parts[1]).success;
  }, "Expected created_at~id from the last displayed record").describe("Continue after the last displayed record: created_at~id, preserving the timestamp exactly").optional(),
};

/** Input validation permits only an ISO timestamp and UUID in this PostgREST filter. */
export function historyBefore(cursor: string) {
  const [createdAt, id] = cursor.split("~");
  return `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`;
}
