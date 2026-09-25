// app/(app)/compliance/period.ts — one reporting period as the URL segment:
// a month YYYY-MM, a quarter YYYY-Qn, or a year YYYY; its date range, and its
// label. A TTB filing covers exactly one of these (#486). The UI files TTB
// periods; other jurisdictions and ranges are reachable through the API.
export const JURISDICTION = "TTB";

export type Cadence = "month" | "quarter" | "year";

const pad = (n: number) => String(n).padStart(2, "0");

/** The year, first month (1-12), and month count a period key covers. */
function span(key: string): { y: number; m: number; n: number } | null {
  let r = /^(\d{4})-(\d{2})$/.exec(key);
  if (r) return Number(r[2]) >= 1 && Number(r[2]) <= 12 ? { y: Number(r[1]), m: Number(r[2]), n: 1 } : null;
  r = /^(\d{4})-Q([1-4])$/.exec(key);
  if (r) return { y: Number(r[1]), m: (Number(r[2]) - 1) * 3 + 1, n: 3 };
  r = /^(\d{4})$/.exec(key);
  return r ? { y: Number(r[1]), m: 1, n: 12 } : null;
}

export function periodRange(key: string): { periodStart: string; periodEnd: string } | null {
  const s = span(key);
  if (!s) return null;
  const last = new Date(Date.UTC(s.y, s.m - 1 + s.n, 0));
  return { periodStart: `${s.y}-${pad(s.m)}-01`, periodEnd: `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}` };
}

/** The key of the calendar month, quarter, or year that is exactly start..end; null for any other range. */
export function periodKey(start: string, end: string): string | null {
  // The month, quarter and year that contain start; the one whose range is exactly start..end wins.
  const year = start.slice(0, 4);
  const month = start.slice(5, 7);
  const candidates = [`${year}-${month}`, `${year}-Q${Math.ceil(Number(month) / 3)}`, year];
  return candidates.find((key) => {
    const range = periodRange(key);
    return range?.periodStart === start && range.periodEnd === end;
  }) ?? null;
}

export const cadenceOf = (key: string): Cadence => (key.includes("Q") ? "quarter" : key.length === 4 ? "year" : "month");

/** A period can be filed only once it is over in the brewery's calendar (#429). */
export const periodOver = (key: string, today: string) => (periodRange(key)?.periodEnd ?? "") < today;

export function periodLabel(key: string): string {
  const c = cadenceOf(key);
  if (c === "year") return key;
  if (c === "quarter") return `${key.slice(5)} ${key.slice(0, 4)}`;
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

const RECENT: Record<Cadence, number> = { month: 3, quarter: 4, year: 2 };

/** The recent periods of one cadence ending with the one holding `today` (YYYY-MM-DD), newest first. */
export function recentPeriods(today: string, cadence: Cadence): string[] {
  const [y, mo] = today.split("-").map(Number);
  return Array.from({ length: RECENT[cadence] }, (_, i) => {
    if (cadence === "year") return String(y - i);
    const step = cadence === "quarter" ? 3 : 1;
    const d = new Date(Date.UTC(y, mo - 1 - i * step, 1));
    const [yy, m] = [d.getUTCFullYear(), d.getUTCMonth() + 1];
    return cadence === "quarter" ? `${yy}-Q${Math.ceil(m / 3)}` : `${yy}-${pad(m)}`;
  });
}

export const bbl = (n: number) => n.toFixed(2);
