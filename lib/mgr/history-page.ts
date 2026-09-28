import { historyCursor, historyInput, HISTORY_PAGE_SIZE, type HistoryRow } from "@/lib/commands/history";

export { HISTORY_PAGE_SIZE, type HistoryRow };

/** The URL's cursor when it is one well-formed value. A hand-edited or repeated
 *  cursor opens the newest page: the app only ever links valid ones, and the
 *  newest page is what Newest would show anyway. */
export function pageCursor(value: unknown) {
  return historyInput.cursor.safeParse(value).data;
}

/** The extra query row proves another page exists; it is displayed on that next page.
 *  Newest links back to the first page and appears only when a cursor is open. */
export function historyPage<T extends HistoryRow>(records: T[], path: string, cursor: string | undefined, filters: Record<string, string | undefined> = {}) {
  const rows = records.slice(0, HISTORY_PAGE_SIZE);
  const more = records.length > HISTORY_PAGE_SIZE;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const firstHref = cursor ? `${path}${params.size ? `?${params}` : ""}` : undefined;
  if (more) params.set("cursor", historyCursor(rows.at(-1)!));
  return { rows, pagination: { moreHref: more ? `${path}?${params}` : undefined, firstHref } };
}
