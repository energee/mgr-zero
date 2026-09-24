const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dayHeader = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });

const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** "Sep 14" for a date-only ISO string; the week a batch is planned, the day a lot is due. */
export const formatMonthDay = (value: string) => monthDay.format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
export const formatDate = (value: string | Date) => date.format(typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value);
export const formatDayHeader = (value: string | Date) => dayHeader.format(new Date(value));
// Formatter construction costs far more than formatting, and these render per
// row; cache one per time zone the way `date` and `dayHeader` are cached above.
const dateTimes = new Map<string, Intl.DateTimeFormat>();
const dateTime = (timeZone?: string) => {
  const key = timeZone ?? "";
  let format = dateTimes.get(key);
  if (!format) dateTimes.set(key, format = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone,
  }));
  return format;
};
export const formatDateTime = (value: string | Date, timeZone?: string) => dateTime(timeZone).format(new Date(value));
/** The calendar day (YYYY-MM-DD) `at` falls on in `timeZone`. A date field's
 *  default is the brewery's day, not the UTC day `toISOString()` names — which
 *  is already tomorrow on a US evening (#437). breweryToday(ctx) is the caller. */
export const breweryDate = (timeZone: string, at: Date = new Date()) => at.toLocaleDateString("en-CA", { timeZone });
