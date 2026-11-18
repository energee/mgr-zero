import { HISTORY_PAGE_SIZE, historyInput, type HistoryPage, type HistoryRow, type NumberedHistoryPage } from "@/lib/commands/history";

export type { HistoryPage, HistoryRow, NumberedHistoryPage };

/** The URL's cursor when it is one well-formed value. A hand-edited or repeated
 *  cursor opens the newest page: the app only ever links valid ones, and the
 *  newest page is what Newest would show anyway. */
export function pageCursor(value: unknown) {
  return historyInput.cursor.safeParse(value).data;
}

export const historySizes = ["10", "25", String(HISTORY_PAGE_SIZE), "100"];

export function pageSize(value: unknown) {
  return typeof value === "string" && historySizes.includes(value) ? Number(value) : HISTORY_PAGE_SIZE;
}

// Inventory movements still use timestamp cursors.
export function historyPage<T extends HistoryRow>(page: HistoryPage<T>, path: string, cursor: string | undefined, filters: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const firstHref = cursor ? `${path}${params.size ? `?${params}` : ""}` : undefined;
  if (page.nextCursor) params.set("cursor", page.nextCursor);
  return { rows: page.rows, pagination: { moreHref: page.nextCursor ? `${path}?${params}` : undefined, firstHref } };
}

export function pageNumber(value: unknown) {
  if (typeof value !== "string" || !/^[1-9]\d{0,6}$/.test(value)) return 1;
  const page = Number(value);
  return page <= 1_000_000 ? page : 1;
}

const limitKeys = { page: "limit", completedPage: "completedLimit", cancelledPage: "cancelledLimit" };

export function numberedHistoryPage<T>(result: NumberedHistoryPage<T>, path: string, currentPage: number, limit: number, filters: Record<string, string | undefined> = {}, pageKey: keyof typeof limitKeys = "page") {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const limitKey = limitKeys[pageKey];
  const sizeHrefs: Record<string, string> = {};
  for (const size of historySizes) {
    params.set(limitKey, size);
    sizeHrefs[size] = `${path}?${params}&${pageKey}=1`;
  }
  if (limit === HISTORY_PAGE_SIZE) params.delete(limitKey);
  else params.set(limitKey, String(limit));
  function href(number: number) {
    params.set(pageKey, String(number));
    return `${path}?${params}`;
  }

  const last = Math.max(1, Math.ceil(result.total / limit));
  // Keep both endpoints and three adjacent pages. Fill a one-page gap rather than drawing an ellipsis for it.
  const start = Math.max(1, Math.min(currentPage - 1, last - 2));
  const end = Math.min(last, start + 2);
  const numbers = new Set([1]);
  if (start === 3) numbers.add(2);
  for (let n = start; n <= end; n++) numbers.add(n);
  if (end === last - 2) numbers.add(last - 1);
  numbers.add(last);
  const pages = Array.from(numbers, number => ({ number, href: href(number) }));
  const previousHref = currentPage > 1 ? href(Math.min(currentPage - 1, last)) : undefined;
  const nextHref = currentPage < last ? href(currentPage + 1) : undefined;
  return { rows: result.rows, pagination: { currentPage, limit, sizeHrefs, pages, previousHref, nextHref } };
}
