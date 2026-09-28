import { z } from "zod";

/** Records per history page; also the API default. */
export const HISTORY_PAGE_SIZE = 50;
export type HistoryRow = { id: string; created_at: string };

// Keep PostgreSQL's timestamp precision: converting through Date loses microseconds.
export const historyInput = {
  limit: z.number().int().min(1).max(200).default(HISTORY_PAGE_SIZE),
  cursor: z.string().refine(value => {
    const parts = value.split("~");
    return parts.length === 2 && z.iso.datetime({ offset: true }).safeParse(parts[0]).success && z.uuid().safeParse(parts[1]).success;
  }, "Expected created_at~id from the last displayed record").describe("Continue after the last displayed record: created_at~id, preserving the timestamp exactly").optional(),
};

/** Input validation permits only an ISO timestamp and UUID in this PostgREST filter. */
function historyBefore(cursor: string) {
  const [createdAt, id] = cursor.split("~");
  return `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`;
}

/** The cursor for the last displayed row, read back by historyBefore. */
export function historyCursor(row: HistoryRow) {
  return `${row.created_at}~${row.id}`;
}

type HistoryQuery<Q> = {
  order(column: "created_at" | "id", options: { ascending: false }): Q;
  or(filter: string): Q;
};

/** Newest first, after the cursor. The cursor depends on this exact created_at, id order.
 *  Callers keep `.limit(i.limit + 1)` beside `.from(` so tests/unpaged-reads.test.ts sees the
 *  bound; the extra row is the lookahead historyResult reads. */
export function newestFirst<Q extends HistoryQuery<Q>>(q: Q, cursor: string | undefined): Q {
  const ordered = q.order("created_at", { ascending: false }).order("id", { ascending: false });
  return cursor ? ordered.or(historyBefore(cursor)) : ordered;
}

/** What every history query returns: one page, and the cursor for the next one
 *  (null on the last page). */
export type HistoryPage<T> = { rows: T[]; nextCursor: string | null };

/** Turns `limit + 1` fetched rows into one page: the extra row only proves
 *  another page exists, and the next page starts with it. */
export function historyResult<T extends HistoryRow>(fetched: T[], limit: number): HistoryPage<T> {
  const rows = fetched.slice(0, limit);
  return { rows, nextCursor: fetched.length > limit ? historyCursor(rows.at(-1)!) : null };
}
