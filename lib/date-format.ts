// lib/date-format.ts — the user-facing date and time formats. A timestamp is an
// instant; every formatter that prints one takes the brewery's IANA time zone
// (breweries.timezone, carried by getActiveBrewery()) so the server and the
// browser print the same wall clock and day (#442). Date-only values
// (YYYY-MM-DD: brewed_on, counted_on, planned_week) are calendar days already
// and read the same in every zone.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Formatter construction costs far more than formatting, and these render per
// row; cache one per options-and-zone pair.
const formatters = new Map<string, Intl.DateTimeFormat>();
const zoned = (options: Intl.DateTimeFormatOptions, timeZone: string) => {
  const key = `${JSON.stringify(options)}@${timeZone}`;
  let format = formatters.get(key);
  if (!format) formatters.set(key, format = new Intl.DateTimeFormat("en-US", { ...options, timeZone }));
  return format;
};

const DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
const MONTH_DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
const DAY_HEADER: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
const DATE_TIME: Intl.DateTimeFormatOptions = { ...DATE, hour: "numeric", minute: "2-digit" };
const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true };

/** "Sep 14" for a date-only ISO string; the week a batch is planned, the day a lot is due. */
export const formatMonthDay = (value: string) => zoned(MONTH_DAY, "UTC").format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
/** "Sep 14, 2026". A date-only string is that calendar day; a timestamp is the
 *  day it falls on in `timeZone` (never its UTC prefix), so it needs the zone. */
export const formatDate = (value: string | Date, timeZone?: string) => {
  if (typeof value === "string" && DATE_ONLY.test(value)) return zoned(DATE, "UTC").format(new Date(`${value}T00:00:00Z`));
  if (!timeZone) throw new Error(`formatDate: the timestamp ${String(value)} needs the brewery time zone`);
  return zoned(DATE, timeZone).format(new Date(value));
};
/** "Sun, Sep 13": the Today header, in the brewery's zone. */
export const formatDayHeader = (value: string | Date, timeZone: string) => zoned(DAY_HEADER, timeZone).format(new Date(value));
/** "Sep 13, 2026, 8:30 PM" in the brewery's zone. */
export const formatDateTime = (value: string | Date, timeZone: string) => zoned(DATE_TIME, timeZone).format(new Date(value));
/** "8:30 PM" in the brewery's zone. */
export const formatTimeOfDay = (value: string | Date, timeZone: string) => zoned(TIME, timeZone).format(new Date(value));
/** The calendar day (YYYY-MM-DD) `at` falls on in `timeZone`. A date field's
 *  default is the brewery's day, not the UTC day `toISOString()` names — which
 *  is already tomorrow on a US evening (#437). breweryToday(ctx) is the caller. */
export const breweryDate = (timeZone: string, at: Date = new Date()) => at.toLocaleDateString("en-CA", { timeZone });

/** A datetime-local field in the brewery's wall clock, never the browser's zone. */
export function dateTimeInput(value: string | Date, timeZone: string): string {
  const parts = Object.fromEntries(zoned({
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }, timeZone).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

/** Resolve an edited brewery wall clock. DST gaps/folds require a different
 * time; an unchanged default/recovery keeps its known instant, including
 * fractional seconds and either occurrence of a repeated hour. */
export function dateTimeInputInstant(value: string, timeZone: string, original?: string): string {
  const wall = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
  const timestamp = Date.parse(`${wall}Z`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(wall)
    || !Number.isFinite(timestamp) || dateTimeInput(new Date(timestamp), "UTC") !== wall) {
    throw new Error("Enter a valid observed date and time.");
  }
  if (original && dateTimeInput(original, timeZone) === wall) return original;

  // Sample either side of the date to discover the zone's actual offsets,
  // including half-hour transitions; never assume a fixed or whole-hour offset.
  const offsets = new Set<number>();
  for (const days of [-1, 0, 1]) {
    const sample = timestamp + days * 86_400_000;
    offsets.add(Date.parse(`${dateTimeInput(new Date(sample), timeZone)}Z`) - sample);
  }
  const matches = [...offsets].map(offset => new Date(timestamp - offset))
    .filter(candidate => dateTimeInput(candidate, timeZone) === wall);
  if (matches.length === 0) throw new Error(`This time does not exist in ${timeZone} because the clocks change. Choose another observation time.`);
  if (matches.length > 1) throw new Error(`This time occurs twice in ${timeZone} because the clocks change. Choose an unambiguous observation time.`);
  return matches[0].toISOString();
}
