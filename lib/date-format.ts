const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dayHeader = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });

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
