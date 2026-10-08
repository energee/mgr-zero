// tests/today-view.test.ts — Today rows keep a real dueAt and print it in the brewery's zone (#717).
import { describe, expect, it } from "vitest";
import { toTodayViewProps } from "../lib/mgr/today-view";
import type { TodayItem } from "../lib/commands/today";

const item = (subjectId: string, dueAt: string | null, reason: TodayItem["reason"] = "fermentation_reading_overdue"): TodayItem => ({
  reason,
  subjectType: "occupancy",
  subjectId,
  sourceVersion: "1",
  safeLabel: `FV-${subjectId}`,
  detail: "Reading due",
  dueAt,
  href: `/cellar/${subjectId}`,
  recipientRoles: ["brewer"],
  assignedUserId: null,
});

const now = new Date("2026-10-08T18:00:00Z"); // 2:00 PM in New York
const timeZone = "America/New_York";

describe("Today due times", () => {
  it("keeps dueAt and names overdue and upcoming times in the brewery zone", () => {
    const model = toTodayViewProps({
      date: "Thu, Oct 8",
      items: [item("1", "2026-10-07T13:00:00Z"), item("2", "2026-10-08T16:30:00Z"), item("3", "2026-10-08T22:00:00Z")],
      timeZone,
      now,
    });
    expect(model.rows.map((r) => [r.dueAt, r.detail])).toEqual([
      ["2026-10-07T13:00:00Z", "Reading due · overdue since Oct 7, 2026, 9:00 AM"],
      ["2026-10-08T16:30:00Z", "Reading due · overdue since 12:30 PM"],
      ["2026-10-08T22:00:00Z", "Reading due · due 6:00 PM"],
    ]);
  });

  it("never invents a deadline for a task without dueAt", () => {
    const model = toTodayViewProps({ date: "Thu, Oct 8", items: [item("1", null)], timeZone, now });
    expect(model.rows[0].detail).toBe("Reading due");
    expect(model.rows[0]).not.toHaveProperty("dueAt");
  });

  it("adds no clock time to a date-only deadline such as a ship date", () => {
    const model = toTodayViewProps({ date: "Thu, Oct 8", items: [{ ...item("1", "2026-10-08T04:00:00Z", "pick_due"), detail: "pick due · ships Thu 10/8" }], now });
    expect(model.rows[0].detail).toBe("pick due · ships Thu 10/8");
    expect(model.rows[0].dueAt).toBe("2026-10-08T04:00:00Z");
  });
});
