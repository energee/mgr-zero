// lib/time-window.ts — the one place that turns a stored `hh:mm` time of day
// into the string a brewer reads, and that measures a window which may wrap
// midnight. Storage stays 24-hour `hh:mm`, matching set_brewery_quiet_hours
// (lib/commands/chat.ts) and the personal quiet-hours override beside it.
export const MINUTES_PER_DAY = 1440;
const NOON = MINUTES_PER_DAY / 2;

// Pinned, not the ambient locale: the server formats during SSR and the browser
// on hydration, so an implicit locale renders two different strings and React
// reports a hydration mismatch.
const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

/** A 24-hour `hh:mm` as minutes since midnight. Anything unparseable is midnight, never NaN. */
export function parseClock(value: string) {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return 0;
  return h * 60 + m;
}

/** Minutes since midnight as a 12-hour clock reading: 1260 → "9:00 PM". */
export function formatClock(minutes: number) {
  return clock.format(new Date(2000, 0, 1, 0, ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY));
}

/** Distance along a track that starts at noon. A night window crosses midnight,
 *  so on a midnight-anchored track it runs backwards; from noon it is one span. */
export const toNoonOffset = (minutes: number) => (minutes - NOON + MINUTES_PER_DAY) % MINUTES_PER_DAY;
/** The inverse. A full turn (1440) lands back on noon rather than falling off the end. */
export const fromNoonOffset = (offset: number) => (offset + NOON) % MINUTES_PER_DAY;

/** How long the window lasts, counting forward from start. Start == end is a
 *  whole day: quiet hours covering nothing would be "off", which is its own control. */
export function windowMinutes(start: number, end: number) {
  const span = (end - start + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return span === 0 ? MINUTES_PER_DAY : span;
}

/** Both ends and the length: "9:00 PM – 6:00 AM · 9 hours". */
export function formatWindow(start: number, end: number) {
  return `${formatClock(start)} – ${formatClock(end)} · ${formatDuration(windowMinutes(start, end))}`;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

function formatDuration(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!minutes) return plural(hours, "hour");
  if (!hours) return plural(minutes, "minute");
  return `${plural(hours, "hour")} ${plural(minutes, "minute")}`;
}
