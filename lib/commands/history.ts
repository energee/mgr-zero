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

/** The cursor for the last displayed row, read back by historyBefore. */
export function historyCursor(row: { created_at: string; id: string }) {
  return `${row.created_at}~${row.id}`;
}

type HistoryQuery<Q> = {
  order(column: "created_at" | "id", options: { ascending: false }): Q;
  or(filter: string): Q;
};

/** Newest first, after the cursor. The cursor depends on this exact created_at, id order.
 *  Callers keep `.limit(i.limit)` beside `.from(` so tests/unpaged-reads.test.ts sees the bound. */
export function newestFirst<Q extends HistoryQuery<Q>>(q: Q, cursor: string | undefined): Q {
  const ordered = q.order("created_at", { ascending: false }).order("id", { ascending: false });
  return cursor ? ordered.or(historyBefore(cursor)) : ordered;
}
