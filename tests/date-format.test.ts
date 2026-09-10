import { expect, it } from "vitest";
import { formatDate, formatDateTime, formatDayHeader } from "@/lib/date-format";

it("uses consistent user-facing date formats without timestamp seconds", () => {
  expect(formatDayHeader("2026-09-10T12:10:24Z")).toBe("Thu, Sep 10");
  expect(formatDate("2026-09-10")).toBe("Sep 10, 2026");
  expect(formatDateTime("2026-09-10T08:10:24-04:00", "America/New_York")).toBe("Sep 10, 2026, 8:10 AM");
});
