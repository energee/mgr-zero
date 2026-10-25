import { readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { breweryDate, formatDate, formatDateTime, formatDayHeader, formatWeekday, dateTimeInput, dateTimeInputInstant } from "@/lib/date-format";
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

it("roundtrips the brewery wall clock independently of the browser zone (#1379)", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    for (const [instant, wall, zone] of [
      ["2026-10-25T18:23:45.000Z", "2026-10-25T14:23:45", "America/New_York"],
      ["2026-01-25T18:23:45.000Z", "2026-01-25T13:23:45", "America/New_York"],
      ["2026-10-25T18:23:45.000Z", "2026-10-26T00:08:45", "Asia/Kathmandu"],
      ["2026-10-25T04:00:00.000Z", "2026-10-25T00:00:00", "America/New_York"],
    ]) {
      expect(dateTimeInput(instant, zone)).toBe(wall);
      expect(dateTimeInputInstant(wall, zone)).toBe(instant);
      expect(formatDateTime(dateTimeInputInstant(wall, zone), zone)).toBe(formatDateTime(instant, zone));
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

it("refuses nonexistent or ambiguous edited times rather than moving the observation (#1379)", () => {
  expect(() => dateTimeInputInstant("2026-03-08T02:30:00", "America/New_York")).toThrow(/does not exist/);
  expect(() => dateTimeInputInstant("2026-11-01T01:30:00", "America/New_York")).toThrow(/occurs twice/);
  expect(() => dateTimeInputInstant("2026-10-04T02:15:00", "Australia/Lord_Howe")).toThrow(/does not exist/);
  expect(() => dateTimeInputInstant("2026-04-05T01:45:00", "Australia/Lord_Howe")).toThrow(/occurs twice/);
  expect(() => dateTimeInputInstant("2026-02-30T12:00:00", "UTC")).toThrow(/valid/);
});

it("preserves the original observation instant and precision in unchanged recovery drafts (#1379)", () => {
  for (const instant of ["2026-11-01T05:30:00.123Z", "2026-11-01T01:30:00.456-05:00"]) {
    const value = dateTimeInput(instant, "America/New_York");
    expect(dateTimeInputInstant(value, "America/New_York", instant)).toBe(instant);
    expect(dateTimeInputInstant("2026-11-01T03:00", "America/New_York", instant)).toBe("2026-11-01T08:00:00.000Z");
  }
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
