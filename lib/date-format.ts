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
const WEEKDAY: Intl.DateTimeFormatOptions = { weekday: "short" };

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
/** "Sun" in the brewery's zone. */
export const formatWeekday = (value: string | Date, timeZone: string) => zoned(WEEKDAY, timeZone).format(new Date(value));
/** The calendar day (YYYY-MM-DD) `at` falls on in `timeZone`. A date field's
 *  default is the brewery's day, not the UTC day `toISOString()` names — which
 *  is already tomorrow on a US evening (#437). breweryToday(ctx) is the caller. */
export const breweryDate = (timeZone: string, at: Date = new Date()) => at.toLocaleDateString("en-CA", { timeZone });
