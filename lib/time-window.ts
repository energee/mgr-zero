// lib/time-window.ts — turns a stored `hh:mm` time of day into the string a
// brewer reads, and measures a window which may wrap midnight. Storage stays
// 24-hour `hh:mm`, matching set_brewery_quiet_hours (lib/commands/chat.ts) and
// the personal quiet-hours override beside it. The Slack previews in
// lib/chat/preview-fixtures.ts still spell their own window out by hand.
export const MINUTES_PER_DAY = 1440;
export const NOON = MINUTES_PER_DAY / 2;

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

/** Minutes since midnight as a 12-hour clock reading: 1260 → "9:00 PM".
 *  Date rolls minutes over on its own, so an out-of-range figure still reads as a clock. */
export function formatClock(minutes: number) {
  return clock.format(new Date(2000, 0, 1, 0, minutes));
}

/** Position on a track anchored at `anchor` minutes, and back again. */
export const toOffset = (minutes: number, anchor: number) => (minutes - anchor + MINUTES_PER_DAY) % MINUTES_PER_DAY;
export const fromOffset = (offset: number, anchor: number) => (offset + anchor) % MINUTES_PER_DAY;

/** The clock hour a track has to start at to draw this window as one forward span.
 *  A slider track is monotonic, so it cannot draw a window that crosses its own
 *  ends: quiet hours (21:00 → 06:00) cross midnight and so run noon to noon,
 *  while taproom hours (11:00 → 22:00) cross noon and so run midnight to midnight.
 *  Without this the two offsets come out descending and Radix draws the range
 *  with a negative width, then swaps the ends on the first drag. */
export const anchorFor = (start: number, end: number) => (start <= end ? 0 : NOON);

/** The noon-anchored track, the case a window through midnight needs. */
export const toNoonOffset = (minutes: number) => toOffset(minutes, NOON);
export const fromNoonOffset = (offset: number) => fromOffset(offset, NOON);

/** How long the window lasts, counting forward from start. Start == end is a
 *  whole day: a window covering nothing would be "off", which is its own control. */
function windowMinutes(start: number, end: number) {
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
