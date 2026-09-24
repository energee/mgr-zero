import { readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { breweryDate, formatDate, formatDateTime, formatDayHeader, formatWeekday } from "@/lib/date-format";
import { formatTime } from "@/lib/time-window";

it("uses consistent user-facing date formats without timestamp seconds", () => {
  expect(formatDayHeader("2026-09-10T12:10:24Z", "America/New_York")).toBe("Thu, Sep 10");
  expect(formatDate("2026-09-10")).toBe("Sep 10, 2026");
  expect(formatDateTime("2026-09-10T08:10:24-04:00", "America/New_York")).toBe("Sep 10, 2026, 8:10 AM");
});

it("names the brewery's calendar day, not the UTC day, for a date field default (#437)", () => {
  // 10:30 PM on Sep 23 in New York is already Sep 24 in UTC.
  const evening = new Date("2026-09-24T02:30:00Z");
  expect(breweryDate("America/New_York", evening)).toBe("2026-09-23");
  expect(breweryDate("America/Los_Angeles", evening)).toBe("2026-09-23");
  expect(breweryDate("UTC", evening)).toBe("2026-09-24");
});

// #442: a timestamp reads in the brewery's zone on the server and in the
// browser alike. 01:30 UTC on Sep 14 is 8:30 PM on Sunday Sep 13 in Chicago.
const evening = "2026-09-14T01:30:00Z";
const chicago = "America/Chicago";

it("formats a timestamp's wall clock in the brewery's zone, not the host's (#442)", () => {
  expect(formatDateTime(evening, chicago)).toBe("Sep 13, 2026, 8:30 PM");
  expect(formatDateTime(evening, "UTC")).toBe("Sep 14, 2026, 1:30 AM");
  expect(formatTime(evening, chicago)).toBe("8:30 PM");
  expect(formatTime(null, chicago)).toBe("");
  expect(formatWeekday(evening, chicago)).toBe("Sun");
  expect(formatDayHeader(new Date(evening), chicago)).toBe("Sun, Sep 13");
});

it("names the day a timestamp falls on in the brewery's zone, not its UTC prefix (#442)", () => {
  expect(formatDate(evening, chicago)).toBe("Sep 13, 2026");
  expect(formatDate("2026-09-14T01:30:00+00:00", chicago)).toBe("Sep 13, 2026");
  // A date-only value is a calendar day already; no zone moves it.
  expect(formatDate("2026-09-14", chicago)).toBe("Sep 14, 2026");
  expect(formatDate("2026-09-14")).toBe("Sep 14, 2026");
  // A timestamp with no zone has no honest day to print.
  expect(() => formatDate(evening)).toThrow(/time zone/);
});

// Structural: a timestamp column handed to formatDate without the brewery's
// zone is the UTC-prefix bug of #442 again (formatDate would throw at render).
// Source text is the subject; the type checker cannot tell a date from a timestamp.
it("never hands formatDate a timestamp field without the brewery's zone (#442)", () => {
  const root = new URL("../", import.meta.url);
  const files = ["app", "components", "lib"].flatMap(dir =>
    (readdirSync(new URL(dir, root), { recursive: true }) as string[]).filter(f => /\.tsx?$/.test(f)).map(f => `${dir}/${f}`));
  const offenders = files.flatMap(file => [...readFileSync(new URL(file, root), "utf8")
    .matchAll(/formatDate\(\s*[\w.?!]*(?:_at|\.at|At)!?\s*\)/g)].map(match => `${file}: ${match[0]}`));
  expect(offenders).toEqual([]);
});
