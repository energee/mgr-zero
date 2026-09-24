import { expect, it } from "vitest";
import { breweryDate, formatDate, formatDateTime, formatDayHeader } from "@/lib/date-format";

it("uses consistent user-facing date formats without timestamp seconds", () => {
  expect(formatDayHeader("2026-09-10T12:10:24Z")).toBe("Thu, Sep 10");
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
