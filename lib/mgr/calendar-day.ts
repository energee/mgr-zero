// lib/mgr/calendar-day.ts — renders stored ISO dates as compact calendar days.
const calendarDayFormatter = new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric", timeZone: "UTC" });

/** Render an ISO date or timestamp as an unpadded month/day without shifting time zones. */
export function calendarDay(iso: string): string {
  return calendarDayFormatter.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}
