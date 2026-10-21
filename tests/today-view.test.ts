// tests/today-view.test.ts — Today rows keep a real dueAt and print it in the brewery's zone (#717).
import { describe, expect, it } from "vitest";
import { toTodayViewProps } from "../lib/mgr/today-view";
import type { TodayItem } from "../lib/commands/today";
import { todayWarehouse } from "../lib/mgr/fixtures/today";

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
    const model = toTodayViewProps({ date: "Thu, Oct 8", items: [{ ...item("1", "2026-10-08T04:00:00Z", "pick_due"), detail: "pick due · ships Oct 8, 2026" }], timeZone, now });
    expect(model.rows[0].detail).toBe("pick due · ships Oct 8, 2026");
    expect(model.rows[0].dueAt).toBe("2026-10-08T04:00:00Z");
  });

  it("marks a ship or route date before the brewery's today as overdue (#993)", () => {
    // Ship dates arrive as midnight of their brewery day; Oct 7 is yesterday in New York.
    const model = toTodayViewProps({ date: "Thu, Oct 8", items: [
      { ...item("1", "2026-10-07T04:00:00Z", "pick_due"), detail: "pick due · ships Oct 7, 2026" },
      { ...item("2", "2026-10-08T04:00:00Z", "submitted_order"), detail: "submitted · ships Oct 8, 2026" },
      { ...item("3", "2026-10-07T04:00:00Z", "submitted_order"), detail: "submitted · ships Oct 7, 2026" },
    ], timeZone, now });
    expect(model.rows.map((r) => [r.detail, r.warning])).toEqual([
      ["pick due · ships Oct 7, 2026 · overdue", true],
      ["submitted · ships Oct 8, 2026", false],
      ["submitted · ships Oct 7, 2026 · overdue", true],
    ]);
  });

  it("the warehouse inventory frame draws the overdue row the adapter writes (#1037)", () => {
    // The fixture is a drawn view model; this pins its wording to the adapter's.
    const drawn = todayWarehouse.rows.find((r) => r.detail.endsWith(" · overdue"));
    expect(drawn).toBeDefined();
    const [adapted] = toTodayViewProps({ date: todayWarehouse.date, items: [
      { ...item("1", "2026-09-02T04:00:00Z", "pick_due"), detail: drawn!.detail.replace(" · overdue", "") },
    ], timeZone, now: new Date("2026-09-03T16:00:00Z") }).rows;
    expect([drawn!.detail, drawn!.verb, drawn!.warning]).toEqual([adapted.detail, adapted.verb, adapted.warning]);
  });

  it("needs the brewery zone to judge a date-only deadline", () => {
    expect(() => toTodayViewProps({ date: "Thu, Oct 8", items: [item("1", "2026-10-07T04:00:00Z", "pick_due")], now })).toThrow(/time zone/);
  });
});
