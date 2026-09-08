// app/(app)/compliance/period.ts — one reporting month as the URL segment
// YYYY-MM, its date range, and its label. The UI files TTB months; other
// jurisdictions and ranges are reachable through the API.
export const JURISDICTION = "TTB";

export function monthRange(month: string): { periodStart: string; periodEnd: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const [y, mo] = [Number(m[1]), Number(m[2])];
  if (mo < 1 || mo > 12) return null;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { periodStart: `${month}-01`, periodEnd: `${month}-${String(last).padStart(2, "0")}` };
}

export const monthLabel = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** The last `n` months ending with `today` (YYYY-MM-DD), newest first. */
export function recentMonths(today: string, n = 3): string[] {
  const [y, mo] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, mo - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export const bbl = (n: number) => n.toFixed(2);
