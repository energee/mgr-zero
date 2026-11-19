import { isUuid } from "@/lib/uuid";
import { CommandError, unwrap } from "./registry";
import { z } from "zod";

/** Records per history page; also the API default. */
export const HISTORY_PAGE_SIZE = 50;
export type HistoryRow = { id: string; created_at: string };

// Keep PostgreSQL's timestamp precision: converting through Date loses microseconds.
const historyInput = {
  limit: z.number().int().min(1).max(200).default(HISTORY_PAGE_SIZE),
  cursor: z.string().refine(value => {
    const parts = value.split("~");
    return parts.length === 2 && z.iso.datetime({ offset: true }).safeParse(parts[0]).success && isUuid(parts[1]);
  }, "Expected created_at~id from the last displayed record").describe("Continue after the last displayed record: created_at~id, preserving the timestamp exactly").optional(),
};

/** Every history query's input: its own filters plus limit, and either a cursor or a numbered page. */
export function numberedHistorySchema<S extends z.ZodRawShape>(shape: S) {
  return z.object({
    ...shape,
    ...historyInput,
    page: z.number().int().min(1).max(1_000_000).describe("Read this 1-based page instead of continuing a cursor").optional(),
  }).refine(input => {
    const { page, cursor } = input as { page?: number; cursor?: string };
    return page === undefined || cursor === undefined;
  }, {
    message: "Use either page or cursor, not both",
    path: ["page"],
  });
}

/** Input validation permits only an ISO timestamp and UUID in this PostgREST filter. */
function historyBefore(cursor: string) {
  const [createdAt, id] = cursor.split("~");
  return `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`;
}

/** The cursor for the last displayed row, read back by historyBefore. */
function historyCursor(row: HistoryRow) {
  return `${row.created_at}~${row.id}`;
}

type HistoryQuery<Q> = {
  order(column: "created_at" | "id", options: { ascending: false }): Q;
  or(filter: string): Q;
};

/** Newest first, after the cursor. The cursor depends on this exact created_at, id order.
 *  Callers keep `.limit(i.limit + 1)` beside `.from(` so tests/unpaged-reads.test.ts sees the
 *  bound; the extra row is the lookahead historyResult reads. */
function newestFirst<Q extends HistoryQuery<Q>>(q: Q, cursor: string | undefined): Q {
  const ordered = q.order("created_at", { ascending: false }).order("id", { ascending: false });
  return cursor ? ordered.or(historyBefore(cursor)) : ordered;
}

/** What every history query returns: one page, and the cursor for the next one
 *  (null on the last page). */
export type HistoryPage<T> = { rows: T[]; nextCursor: string | null };
export type NumberedHistoryPage<T> = HistoryPage<T> & { total: number };

/** Turns `limit + 1` fetched rows into one page: the extra row only proves
 *  another page exists, and the next page starts with it. */
function historyResult<T extends HistoryRow>(fetched: T[], limit: number): HistoryPage<T> {
  const rows = fetched.slice(0, limit);
  return { rows, nextCursor: fetched.length > limit ? historyCursor(rows.at(-1)!) : null };
}

type HistoryResponse = {
  data: unknown[] | null;
  error: { message: string; code?: string; details?: string } | null;
  count?: number | null;
};
interface HistoryReadQuery extends HistoryQuery<HistoryReadQuery>, PromiseLike<HistoryResponse> {
  range(from: number, to: number): HistoryReadQuery;
}

/** Callers request an exact count only for numbered reads, with all their filters
 *  and joins intact. Both modes share the same timestamp/id ordering. */
export async function readHistory<T extends HistoryRow>(
  query: HistoryReadQuery,
  input: { limit: number; cursor?: string; page?: number },
): Promise<HistoryPage<T> | NumberedHistoryPage<T>> {
  const ordered = newestFirst(query, input.cursor);
  if (input.page === undefined) return historyResult((await unwrap(ordered) ?? []) as T[], input.limit);

  const start = (input.page - 1) * input.limit;
  let response = await ordered.range(start, start + input.limit - 1);
  const outOfRange = response.error?.code === "PGRST103";
  // PostgREST returns 416 without a usable count for an offset beyond the last
  // row. Read one row at offset zero to recover the same filtered exact total.
  if (outOfRange) response = await ordered.range(0, 0);
  const fetched = await unwrap(Promise.resolve(response));
  if (response.count === null || response.count === undefined) {
    throw new CommandError("History total unavailable", 500, "query_failed");
  }
  const rows = outOfRange ? [] : (fetched ?? []) as T[];
  return {
    rows,
    nextCursor: rows.length && start + rows.length < response.count ? historyCursor(rows.at(-1)!) : null,
    total: response.count,
  };
}
