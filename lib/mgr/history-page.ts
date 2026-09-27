export const HISTORY_PAGE_SIZE = 50;
export type HistoryRow = { id: string; created_at: string };

/** The extra query row proves another page exists; it is displayed on that next page. */
export function historyPage<T extends HistoryRow>(records: T[], path: string, filters: Record<string, string | undefined> = {}) {
  const rows = records.slice(0, HISTORY_PAGE_SIZE);
  const last = rows.at(-1);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const firstHref = `${path}${params.size ? `?${params}` : ""}`;
  if (last && records.length > HISTORY_PAGE_SIZE) params.set("cursor", `${last.created_at}~${last.id}`);
  return { rows, firstHref, moreHref: records.length > HISTORY_PAGE_SIZE ? `${path}?${params}` : undefined };
}
