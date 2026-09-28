import { historyInput, type HistoryPage, type HistoryRow } from "@/lib/commands/history";

export type { HistoryPage, HistoryRow };

/** The URL's cursor when it is one well-formed value. A hand-edited or repeated
 *  cursor opens the newest page: the app only ever links valid ones, and the
 *  newest page is what Newest would show anyway. */
export function pageCursor(value: unknown) {
  return historyInput.cursor.safeParse(value).data;
}

/** Links for one page a history query returned. More continues from the query's
 *  nextCursor; Newest links back to the first page and appears only when a cursor is open. */
export function historyPage<T extends HistoryRow>(page: HistoryPage<T>, path: string, cursor: string | undefined, filters: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const firstHref = cursor ? `${path}${params.size ? `?${params}` : ""}` : undefined;
  if (page.nextCursor) params.set("cursor", page.nextCursor);
  return { rows: page.rows, pagination: { moreHref: page.nextCursor ? `${path}?${params}` : undefined, firstHref } };
}
